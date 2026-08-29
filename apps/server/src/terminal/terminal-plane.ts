import { ServiceUnavailable } from "@noyau/contracts/errors"
import type { ProjectId, ThreadId } from "@noyau/contracts/ids"
import {
  TerminalCwdNotDirectoryError,
  TerminalCwdNotFoundError,
  TerminalNotRunningError,
  TerminalResizeError,
  TerminalSessionLookupError,
  TerminalWriteError,
  type TerminalAttachInput,
  type TerminalAttachStreamEvent,
  type TerminalClearInput,
  type TerminalCloseInput,
  type TerminalResizeInput,
  type TerminalRestartInput,
  type TerminalScope,
  type TerminalSessionSnapshot,
  type TerminalSessionStatus,
  type TerminalWriteInput,
} from "@noyau/contracts/terminal"
import { resolveWorkspaceCwd } from "@noyau/server/workspace-cwd"
import {
  Context,
  DateTime,
  Effect,
  FileSystem,
  Layer,
  Option,
  PubSub,
  Ref,
  Semaphore,
  Stream,
} from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

import { PtyAdapter, type PtyProcess } from "./pty-adapter.ts"

const DEFAULT_COLS = 120
const DEFAULT_ROWS = 30
const HISTORY_LINE_LIMIT = 5_000
const HISTORY_CHAR_LIMIT = 1_000_000
const ENV_BLOCKLIST = new Set(["PORT", "ELECTRON_RENDERER_PORT", "ELECTRON_RUN_AS_NODE"])

export interface TerminalPlaneService {
  readonly attach: (
    input: TerminalAttachInput,
  ) => Stream.Stream<
    TerminalAttachStreamEvent,
    | ServiceUnavailable
    | TerminalCwdNotFoundError
    | TerminalCwdNotDirectoryError
    | import("@noyau/contracts/terminal").TerminalSpawnError
  >
  readonly write: (
    input: TerminalWriteInput,
  ) => Effect.Effect<
    void,
    TerminalSessionLookupError | TerminalNotRunningError | TerminalWriteError
  >
  readonly resize: (
    input: TerminalResizeInput,
  ) => Effect.Effect<
    void,
    TerminalSessionLookupError | TerminalNotRunningError | TerminalResizeError
  >
  readonly clear: (input: TerminalClearInput) => Effect.Effect<void, TerminalSessionLookupError>
  readonly restart: (
    input: TerminalRestartInput,
  ) => Effect.Effect<
    TerminalSessionSnapshot,
    | ServiceUnavailable
    | TerminalCwdNotFoundError
    | TerminalCwdNotDirectoryError
    | import("@noyau/contracts/terminal").TerminalSpawnError
  >
  readonly close: (input: TerminalCloseInput) => Effect.Effect<void>
}

export class TerminalPlane extends Context.Service<TerminalPlane, TerminalPlaneService>()(
  "@noyau/server/terminal/TerminalPlane",
) {}

interface LiveSession {
  readonly projectId: ProjectId
  readonly threadId: ThreadId
  readonly terminalId: string
  cwd: string
  status: TerminalSessionStatus
  pid: number | null
  history: string
  exitCode: number | null
  exitSignal: number | null
  label: string
  updatedAt: DateTime.Utc
  process: PtyProcess | null
  unsubscribeData: (() => void) | null
  unsubscribeExit: (() => void) | null
}

const sessionKey = (scope: Pick<TerminalScope, "threadId" | "terminalId">) =>
  `${scope.threadId}\0${scope.terminalId}`

const eventMatches = (
  event: TerminalAttachStreamEvent,
  scope: Pick<TerminalScope, "threadId" | "terminalId">,
) => {
  if (event._tag === "snapshot" || event._tag === "restarted") {
    return (
      event.snapshot.threadId === scope.threadId && event.snapshot.terminalId === scope.terminalId
    )
  }
  return event.threadId === scope.threadId && event.terminalId === scope.terminalId
}

const capHistory = (history: string): string => {
  if (history.length === 0) {
    return history
  }
  const bounded =
    history.length > HISTORY_CHAR_LIMIT
      ? history.slice(history.length - HISTORY_CHAR_LIMIT)
      : history
  const hasTrailingNewline = bounded.endsWith("\n")
  const lines = bounded.split("\n")
  if (hasTrailingNewline) {
    lines.pop()
  }
  if (lines.length <= HISTORY_LINE_LIMIT) {
    return bounded
  }
  const kept = lines.slice(lines.length - HISTORY_LINE_LIMIT)
  return hasTrailingNewline ? `${kept.join("\n")}\n` : kept.join("\n")
}

const inheritEnv = (): Record<string, string> => {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !ENV_BLOCKLIST.has(key)) {
      env[key] = value
    }
  }
  env.TERM = "xterm-256color"
  env.COLORTERM = "truecolor"
  return env
}

const resolveShell = (): { readonly shell: string; readonly args: ReadonlyArray<string> } => {
  if (process.platform === "win32") {
    return { shell: process.env.COMSPEC ?? "cmd.exe", args: [] }
  }
  const shell = process.env.SHELL ?? (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash")
  return { shell, args: ["-l"] }
}

const toSnapshot = (session: LiveSession): TerminalSessionSnapshot => ({
  projectId: session.projectId,
  threadId: session.threadId,
  terminalId: session.terminalId,
  cwd: session.cwd,
  status: session.status,
  pid: session.pid,
  history: session.history,
  exitCode: session.exitCode,
  exitSignal: session.exitSignal,
  label: session.label,
  updatedAt: session.updatedAt,
})

const requireSession = (sessions: Map<string, LiveSession>, input: TerminalScope) => {
  const session = sessions.get(sessionKey(input))
  if (session === undefined) {
    return new TerminalSessionLookupError({
      threadId: input.threadId,
      terminalId: input.terminalId,
    })
  }
  return session
}

export const makeTerminalPlane = Effect.fn("TerminalPlane.make")(function* (options?: {
  readonly resolveCwd?: (scope: {
    readonly projectId: ProjectId
    readonly threadId: ThreadId
  }) => Effect.Effect<
    { readonly cwd: string },
    ServiceUnavailable,
    SqlClient | FileSystem.FileSystem
  >
}) {
  const pty = yield* PtyAdapter
  const fileSystem = yield* FileSystem.FileSystem
  const sql = yield* Effect.serviceOption(SqlClient)
  const sessionsRef = yield* Ref.make(new Map<string, LiveSession>())
  const sessionLock = yield* Semaphore.make(1)
  const events = yield* Effect.acquireRelease(
    PubSub.unbounded<TerminalAttachStreamEvent>(),
    (hub) => PubSub.shutdown(hub),
  )
  const resolveCwd =
    options?.resolveCwd ??
    ((scope: { readonly projectId: ProjectId; readonly threadId: ThreadId }) => {
      if (Option.isNone(sql)) {
        return Effect.fail(new ServiceUnavailable({ service: "sqlite" }))
      }
      return resolveWorkspaceCwd(scope).pipe(
        Effect.provideService(SqlClient, sql.value),
        Effect.map(({ cwd }) => ({ cwd })),
      )
    })

  const publish = (event: TerminalAttachStreamEvent) => PubSub.publish(events, event)

  const assertCwd = Effect.fn("TerminalPlane.assertCwd")(function* (cwd: string) {
    const stat = yield* fileSystem
      .stat(cwd)
      .pipe(Effect.mapError(() => new TerminalCwdNotFoundError({ cwd })))
    if (stat.type !== "Directory") {
      return yield* new TerminalCwdNotDirectoryError({ cwd })
    }
  })

  const detachProcess = (session: LiveSession) => {
    session.unsubscribeData?.()
    session.unsubscribeExit?.()
    session.unsubscribeData = null
    session.unsubscribeExit = null
    const processHandle = session.process
    session.process = null
    session.pid = null
    processHandle?.kill()
  }

  const bindProcess = Effect.fn("TerminalPlane.bindProcess")(function* (
    session: LiveSession,
    processHandle: PtyProcess,
  ) {
    session.process = processHandle
    session.pid = processHandle.pid
    session.status = "running"
    session.exitCode = null
    session.exitSignal = null
    session.updatedAt = yield* DateTime.now
    session.unsubscribeData = processHandle.onData((data) => {
      session.history = capHistory(`${session.history}${data}`)
      session.updatedAt = DateTime.nowUnsafe()
      // Native callback: history must be visible before publish. The hub is
      // unbounded, so publish does not suspend. runFork dropped events in tests.
      Effect.runSync(
        publish({
          _tag: "output",
          projectId: session.projectId,
          threadId: session.threadId,
          terminalId: session.terminalId,
          data,
        }),
      )
    })
    session.unsubscribeExit = processHandle.onExit((event) => {
      session.unsubscribeData?.()
      session.unsubscribeExit?.()
      session.unsubscribeData = null
      session.unsubscribeExit = null
      session.process = null
      session.pid = null
      session.status = "exited"
      session.exitCode = event.exitCode
      session.exitSignal = event.signal
      session.updatedAt = DateTime.nowUnsafe()
      Effect.runSync(
        publish({
          _tag: "exited",
          projectId: session.projectId,
          threadId: session.threadId,
          terminalId: session.terminalId,
          exitCode: event.exitCode,
          exitSignal: event.signal,
        }),
      )
    })
  })

  const spawnSession = Effect.fn("TerminalPlane.spawnSession")(function* (
    session: LiveSession,
    cols: number,
    rows: number,
  ) {
    detachProcess(session)
    const { shell, args } = resolveShell()
    const processHandle = yield* pty.spawn({
      shell,
      args,
      cwd: session.cwd,
      cols,
      rows,
      env: inheritEnv(),
    })
    yield* bindProcess(session, processHandle)
  })

  const withSessionLock = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    sessionLock.withPermits(1)(effect)

  const ensureSessionUnlocked = Effect.fn("TerminalPlane.ensureSessionUnlocked")(function* (
    input: TerminalAttachInput | TerminalRestartInput,
    flags?: { readonly restart?: boolean },
  ) {
    const { cwd } = yield* resolveCwd(input)
    yield* assertCwd(cwd)
    const key = sessionKey(input)
    const cols = input.cols ?? DEFAULT_COLS
    const rows = input.rows ?? DEFAULT_ROWS
    const now = yield* DateTime.now
    const existing = (yield* Ref.get(sessionsRef)).get(key)
    if (existing !== undefined && flags?.restart !== true && existing.process !== null) {
      return existing
    }
    const session =
      existing ??
      ({
        projectId: input.projectId,
        threadId: input.threadId,
        terminalId: input.terminalId,
        cwd,
        status: "starting",
        pid: null,
        history: "",
        exitCode: null,
        exitSignal: null,
        label: "Terminal",
        updatedAt: now,
        process: null,
        unsubscribeData: null,
        unsubscribeExit: null,
      } satisfies LiveSession)
    if (existing === undefined) {
      yield* Ref.update(sessionsRef, (sessions) => {
        const next = new Map(sessions)
        next.set(key, session)
        return next
      })
    } else {
      session.cwd = cwd
      if (flags?.restart === true) {
        session.history = ""
      }
    }
    yield* spawnSession(session, cols, rows)
    return session
  })

  const ensureSession = (
    input: TerminalAttachInput | TerminalRestartInput,
    flags?: { readonly restart?: boolean },
  ) => withSessionLock(ensureSessionUnlocked(input, flags))

  const closeSession = Effect.fn("TerminalPlane.closeSession")(function* (session: LiveSession) {
    return yield* withSessionLock(
      Effect.gen(function* () {
        detachProcess(session)
        yield* Ref.update(sessionsRef, (sessions) => {
          const next = new Map(sessions)
          next.delete(sessionKey(session))
          return next
        })
        yield* publish({
          _tag: "closed",
          projectId: session.projectId,
          threadId: session.threadId,
          terminalId: session.terminalId,
        })
      }),
    )
  })

  return TerminalPlane.of({
    attach: (input) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const subscription = yield* PubSub.subscribe(events)
          // Hold the session lock through drain so close cannot publish
          // `closed` into the buffer we are about to discard.
          const session = yield* withSessionLock(
            Effect.gen(function* () {
              const session = yield* ensureSessionUnlocked(input)
              yield* PubSub.takeUpTo(subscription, Number.POSITIVE_INFINITY)
              return session
            }),
          )
          return Stream.concat(
            Stream.succeed({
              _tag: "snapshot" as const,
              snapshot: toSnapshot(session),
            }),
            Stream.fromSubscription(subscription).pipe(
              Stream.filter((event) => eventMatches(event, input)),
            ),
          )
        }),
      ),
    write: Effect.fn("TerminalPlane.write")(function* (input) {
      const session = requireSession(yield* Ref.get(sessionsRef), input)
      if (session instanceof TerminalSessionLookupError) {
        return yield* session
      }
      if (session.process === null) {
        return yield* new TerminalNotRunningError({
          threadId: input.threadId,
          terminalId: input.terminalId,
        })
      }
      yield* Effect.try({
        try: () => {
          session.process?.write(input.data)
        },
        catch: (cause) =>
          new TerminalWriteError({
            threadId: input.threadId,
            terminalId: input.terminalId,
            cause,
          }),
      })
    }),
    resize: Effect.fn("TerminalPlane.resize")(function* (input) {
      const session = requireSession(yield* Ref.get(sessionsRef), input)
      if (session instanceof TerminalSessionLookupError) {
        return yield* session
      }
      if (session.process === null) {
        return yield* new TerminalNotRunningError({
          threadId: input.threadId,
          terminalId: input.terminalId,
        })
      }
      yield* Effect.try({
        try: () => {
          session.process?.resize(input.cols, input.rows)
        },
        catch: (cause) =>
          new TerminalResizeError({
            threadId: input.threadId,
            terminalId: input.terminalId,
            cols: input.cols,
            rows: input.rows,
            cause,
          }),
      })
    }),
    clear: Effect.fn("TerminalPlane.clear")(function* (input) {
      const session = requireSession(yield* Ref.get(sessionsRef), input)
      if (session instanceof TerminalSessionLookupError) {
        return yield* session
      }
      session.history = ""
      session.updatedAt = yield* DateTime.now
      yield* publish({
        _tag: "cleared",
        projectId: input.projectId,
        threadId: input.threadId,
        terminalId: input.terminalId,
      })
    }),
    restart: Effect.fn("TerminalPlane.restart")(function* (input) {
      const session = yield* ensureSession(input, { restart: true })
      const snapshot = toSnapshot(session)
      yield* publish({ _tag: "restarted", snapshot })
      return snapshot
    }),
    close: Effect.fn("TerminalPlane.close")(function* (input) {
      const sessions = [...(yield* Ref.get(sessionsRef)).values()].filter((session) => {
        if (session.threadId !== input.threadId) {
          return false
        }
        return input.terminalId === undefined || session.terminalId === input.terminalId
      })
      for (const session of sessions) {
        yield* closeSession(session)
      }
    }),
  })
})

export const terminalPlaneLayer = Layer.effect(TerminalPlane, makeTerminalPlane())
