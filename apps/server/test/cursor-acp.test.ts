import { fileURLToPath } from "node:url"

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, layer } from "@effect/vitest"
import { ApprovalRequestId, ProviderSessionId, ThreadId, TurnId } from "@noyau/protocol/ids"
import { cursorProviderLayer, resolveCursorExecutable } from "@noyau/server/provider/cursor-acp"
import {
  ProviderPort,
  type ProviderSignal,
  type ProviderTurnInput,
} from "@noyau/server/provider/provider-port"
import { Deferred, Effect, Fiber, FileSystem, Layer, Path } from "effect"
import { TestClock } from "effect/testing"

const platformLayer = Layer.mergeAll(NodeFileSystem.layer, Path.layer)
const fakeAgent = fileURLToPath(new URL("./fixtures/fake-cursor-acp.mjs", import.meta.url))
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const turnId = TurnId.make("30000000-0000-4000-8000-000000000001")

const input = (
  runtimeMode: ProviderTurnInput["runtimeMode"] = "full-access",
  resumeCursor: ProviderTurnInput["resumeCursor"] = null,
): ProviderTurnInput => ({
  threadId,
  turnId,
  text: "Implement the adapter",
  workspaceRoot: process.cwd(),
  runtimeMode,
  resumeCursor,
})

const makeOptions = Effect.fn("CursorAdapterTest.makeOptions")(function* (scenario: string) {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-fake-acp-" })
  const requestLog = path.join(directory, "requests.ndjson")
  const exitLog = path.join(directory, "exit.log")
  return {
    requestLog,
    exitLog,
    options: {
      binaryPath: process.execPath,
      binaryArgs: [fakeAgent],
      environment: {
        PATH: "",
        NOYAU_FAKE_ACP_SCENARIO: scenario,
        NOYAU_FAKE_ACP_REQUEST_LOG: requestLog,
        NOYAU_FAKE_ACP_EXIT_LOG: exitLog,
      },
      clientVersion: "test",
    },
  } as const
})

const withProvider = <A, E, R>(
  scenario: string,
  use: (
    provider: ProviderPort["Service"],
    evidence: { readonly requestLog: string; readonly exitLog: string },
  ) => Effect.Effect<A, E, R>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const evidence = yield* makeOptions(scenario)
      const services = yield* Layer.build(cursorProviderLayer(evidence.options))
      return yield* Effect.gen(function* () {
        const provider = yield* ProviderPort
        return yield* use(provider, evidence)
      }).pipe(Effect.provide(services))
    }),
  )

const capture = Effect.fn("CursorAdapterTest.capture")(function* (
  provider: ProviderPort["Service"],
  turnInput: ProviderTurnInput,
) {
  const signals: Array<ProviderSignal> = []
  yield* provider.startTurn(turnInput, (signal) =>
    Effect.sync(() => {
      signals.push(signal)
    }),
  )
  yield* provider.drain
  return signals
})

const readLog = Effect.fn("CursorAdapterTest.readLog")(function* (filePath: string) {
  const fileSystem = yield* FileSystem.FileSystem
  return yield* fileSystem.readFileString(filePath)
})

layer(platformLayer)("Cursor ACP adapter", (it) => {
  it.effect("detects cursor-agent on PATH and falls back to a configured executable", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-cursor-path-" })
      const pathExecutable = path.join(directory, "cursor-agent")
      const configured = path.join(directory, "configured-cursor")
      yield* fileSystem.writeFileString(pathExecutable, "#!/bin/sh\nexit 0\n")
      yield* fileSystem.writeFileString(configured, "#!/bin/sh\nexit 0\n")
      yield* fileSystem.chmod(pathExecutable, 0o755)
      yield* fileSystem.chmod(configured, 0o755)

      assert.strictEqual(
        yield* resolveCursorExecutable(configured, { PATH: directory }, "linux"),
        pathExecutable,
      )
      assert.strictEqual(
        yield* resolveCursorExecutable(configured, { PATH: "" }, "linux"),
        configured,
      )
    }),
  )

  it.effect("uses handshake capabilities as provider truth", () =>
    Effect.gen(function* () {
      yield* withProvider("success", (provider) =>
        provider.status.pipe(
          Effect.tap((status) =>
            Effect.sync(() => {
              assert.deepStrictEqual(status, {
                installed: true,
                handshakeOk: true,
                version: "2026.03.20-test",
                plan: "Pro",
                binaryPath: process.execPath,
              })
            }),
          ),
        ),
      )
      yield* withProvider("missing-load", (provider) =>
        provider.status.pipe(
          Effect.tap((status) =>
            Effect.sync(() => {
              assert.deepStrictEqual(status, {
                installed: true,
                handshakeOk: false,
                version: "2026.03.20-test",
                plan: "Pro",
                binaryPath: process.execPath,
              })
            }),
          ),
        ),
      )
      yield* withProvider("wrong-version", (provider) =>
        provider.status.pipe(
          Effect.tap((status) =>
            Effect.sync(() => {
              assert.deepStrictEqual(status, {
                installed: true,
                handshakeOk: false,
                version: "2026.03.20-test",
                plan: "Pro",
                binaryPath: process.execPath,
              })
            }),
          ),
        ),
      )
      yield* withProvider("auth-fail", (provider) =>
        provider.status.pipe(
          Effect.tap((status) =>
            Effect.sync(() => {
              assert.deepStrictEqual(status, {
                installed: true,
                handshakeOk: false,
                version: "2026.03.20-test",
                plan: "Pro",
                binaryPath: process.execPath,
              })
            }),
          ),
        ),
      )
    }),
  )

  it.effect("maps new, live updates, and end_turn to Noyau signals", () =>
    withProvider("success", (provider) =>
      Effect.gen(function* () {
        const signals = yield* capture(provider, input())
        assert.isTrue(
          signals.some((signal) => signal._tag === "session" && signal.status === "running"),
        )
        assert.isTrue(
          signals.some(
            (signal) =>
              signal._tag === "transcript" &&
              signal.item._tag === "transcript.assistant" &&
              signal.item.text === "hello from fake Cursor",
          ),
        )
        assert.isTrue(
          signals.some(
            (signal) =>
              signal._tag === "transcript" &&
              signal.item._tag === "transcript.tool" &&
              signal.item.status === "completed" &&
              signal.item.name === "Searched files" &&
              signal.item.action === "search" &&
              signal.item.outputSummary === "mentions légales",
          ),
        )
        assert.isFalse(
          signals.some(
            (signal) =>
              signal._tag === "transcript" &&
              signal.item._tag === "transcript.tool" &&
              (signal.item.outputSummary?.includes("PageHero") === true ||
                signal.item.outputSummary?.includes("{") === true),
          ),
        )
        assert.isTrue(
          signals.some((signal) => signal._tag === "turn-ended" && signal.state === "completed"),
        )
      }),
    ),
  )

  it.effect("falls back from load to new, replaces resumeCursor, and drops replay", () =>
    withProvider("load-fail", (provider, evidence) =>
      Effect.gen(function* () {
        const signals = yield* capture(
          provider,
          input("full-access", {
            schemaVersion: 1,
            sessionId: ProviderSessionId.make("old-session"),
          }),
        )
        const running = signals.find(
          (signal) => signal._tag === "session" && signal.status === "running",
        )
        assert.strictEqual(
          running?._tag === "session" ? running.resumeCursor?.sessionId : undefined,
          "fake-session-new",
        )
        assert.isFalse(
          signals.some(
            (signal) =>
              signal._tag === "transcript" &&
              signal.item._tag === "transcript.assistant" &&
              signal.item.text.includes("replay"),
          ),
        )
        const log = yield* readLog(evidence.requestLog)
        const loadIndex = log.indexOf('"method":"session/load"')
        const newIndex = log.indexOf('"method":"session/new"')
        assert.isTrue(loadIndex >= 0 && newIndex > loadIndex)
      }),
    ),
  )

  it.effect("loads a persisted session in a new subprocess without ingesting replay", () =>
    withProvider("success", (provider, evidence) =>
      Effect.gen(function* () {
        const signals = yield* capture(
          provider,
          input("full-access", {
            schemaVersion: 1,
            sessionId: ProviderSessionId.make("persisted-session"),
          }),
        )
        const running = signals.find(
          (signal) => signal._tag === "session" && signal.status === "running",
        )
        assert.strictEqual(
          running?._tag === "session" ? running.resumeCursor?.sessionId : undefined,
          "persisted-session",
        )
        assert.isFalse(
          signals.some(
            (signal) =>
              signal._tag === "transcript" &&
              signal.item._tag === "transcript.assistant" &&
              signal.item.text.includes("replay"),
          ),
        )
        const log = yield* readLog(evidence.requestLog)
        assert.include(log, '"method":"session/load"')
        assert.notInclude(log, '"method":"session/new"')
      }),
    ),
  )

  it.effect("settles every non-end stop reason as interrupted", () =>
    withProvider("non-end-turn", (provider) =>
      Effect.gen(function* () {
        const signals = yield* capture(provider, input())
        assert.isTrue(
          signals.some((signal) => signal._tag === "turn-ended" && signal.state === "interrupted"),
        )
      }),
    ),
  )

  it.effect("maps a process or stdio rupture to Session error with lastError", () =>
    withProvider("rupture", (provider) =>
      Effect.gen(function* () {
        const signals = yield* capture(provider, input())
        const failed = signals.find(
          (signal) => signal._tag === "session" && signal.status === "error",
        )
        assert.strictEqual(failed?._tag, "session")
        if (failed?._tag === "session") {
          assert.isString(failed.lastError)
          assert.include(failed.lastError ?? "", "session/prompt")
        }
        assert.isFalse(
          signals.some((signal) => signal._tag === "turn-ended" && signal.state === "completed"),
        )
      }),
    ),
  )

  it.effect("maps approval-required to ask and resolves a pending ACP permission", () =>
    withProvider("permission", (provider, evidence) =>
      Effect.gen(function* () {
        const permissionOpened = yield* Deferred.make<void>()
        const signals: Array<ProviderSignal> = []
        yield* provider.startTurn(input("approval-required"), (signal) =>
          Effect.sync(() => {
            signals.push(signal)
          }).pipe(
            Effect.tap(() =>
              signal._tag === "transcript" &&
              signal.item._tag === "transcript.permission" &&
              signal.item.status === "pending"
                ? Deferred.succeed(permissionOpened, undefined)
                : Effect.void,
            ),
          ),
        )
        yield* Deferred.await(permissionOpened)
        yield* provider.respondApproval(
          threadId,
          ApprovalRequestId.make("permission-tool"),
          "accept",
        )
        yield* provider.drain

        const log = yield* readLog(evidence.requestLog)
        assert.include(log, '"configId":"mode"')
        assert.include(log, '"value":"ask"')
        assert.include(
          log,
          '"id":900,"result":{"outcome":{"outcome":"selected","optionId":"once"}}',
        )
        assert.isTrue(
          signals.some((signal) => signal._tag === "turn-ended" && signal.state === "completed"),
        )
      }),
    ),
  )

  it.effect("auto-selects allow_always in full-access mode", () =>
    withProvider("permission", (provider, evidence) =>
      Effect.gen(function* () {
        const signals = yield* capture(provider, input("full-access"))
        const log = yield* readLog(evidence.requestLog)
        assert.include(
          log,
          '"id":900,"result":{"outcome":{"outcome":"selected","optionId":"always"}}',
        )
        assert.isTrue(
          signals.some((signal) => signal._tag === "turn-ended" && signal.state === "completed"),
        )
      }),
    ),
  )

  it.effect("cancels gracefully and settles the PromptResponse as interrupted", () =>
    withProvider("cancel", (provider) =>
      Effect.gen(function* () {
        const promptOpened = yield* Deferred.make<void>()
        const signals: Array<ProviderSignal> = []
        yield* provider.startTurn(input(), (signal) =>
          Effect.sync(() => {
            signals.push(signal)
          }).pipe(
            Effect.tap(() =>
              signal._tag === "transcript" && signal.item._tag === "transcript.assistant"
                ? Deferred.succeed(promptOpened, undefined)
                : Effect.void,
            ),
          ),
        )
        yield* Deferred.await(promptOpened)
        yield* provider.interrupt(threadId)
        yield* provider.drain
        assert.isTrue(
          signals.some((signal) => signal._tag === "turn-ended" && signal.state === "interrupted"),
        )
      }),
    ),
  )

  it.effect("kills the exact child after a silent cancel exceeds two seconds", () =>
    withProvider("ignore-cancel", (provider) =>
      Effect.gen(function* () {
        const promptOpened = yield* Deferred.make<void>()
        const signals: Array<ProviderSignal> = []
        yield* provider.startTurn(input(), (signal) =>
          Effect.sync(() => {
            signals.push(signal)
          }).pipe(
            Effect.tap(() =>
              signal._tag === "transcript" && signal.item._tag === "transcript.assistant"
                ? Deferred.succeed(promptOpened, undefined)
                : Effect.void,
            ),
          ),
        )
        yield* Deferred.await(promptOpened)
        const interrupt = yield* provider.interrupt(threadId).pipe(Effect.forkChild)
        yield* TestClock.adjust("2 seconds")
        yield* Fiber.join(interrupt)
        yield* provider.drain
        assert.isTrue(
          signals.some((signal) => signal._tag === "session" && signal.status === "error"),
        )
      }),
    ),
  )
})
