import { strict as assert } from "node:assert"
import { fileURLToPath, pathToFileURL } from "node:url"
import { inspect } from "node:util"

import type { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import { Clock, Config, Effect, FileSystem, Option, Path, Schema, Stream } from "effect"
import type { ChildProcessSpawner } from "effect/unstable/process"
import { ChildProcess } from "effect/unstable/process"

import {
  durableJourney,
  readRecoveredJourney,
  resumeJourney,
  startInitialJourney,
} from "./durable-smoke-rpc.ts"
import { desktopDir, resolveElectronLaunchCommand } from "./electron-launcher.ts"
import { scriptRuntime } from "./runtime.ts"

type ChildHandle = ChildProcessSpawner.ChildProcessHandle

interface ElectronExit {
  readonly code: number | null
  readonly signal: string | null
}

const exited = (code: number | null, signal: string | null): ElectronExit => ({ code, signal })

class SmokeError extends Schema.TaggedError<SmokeError>()("SmokeError", {
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
}) {}

const SmokeControlBootstrap = Schema.Struct({
  host: Schema.Literals(["127.0.0.1", "::1"]),
  port: Schema.Int,
  bearerToken: Schema.NonEmptyString,
})
const ControlFile = Schema.Struct({
  state: Schema.Struct({
    phase: Schema.optionalKey(Schema.String),
    pid: Schema.optionalKey(Schema.Finite),
  }),
  bootstrap: Schema.NullOr(SmokeControlBootstrap),
})
const decodeControlFile = Schema.decodeUnknownEffect(Schema.fromJsonString(ControlFile))
const RequestParams = Schema.Struct({
  prompt: Schema.optionalKey(Schema.Array(Schema.Struct({ text: Schema.String }))),
  sessionId: Schema.optionalKey(Schema.String),
})
const RequestLine = Schema.Struct({
  method: Schema.optionalKey(Schema.String),
  params: Schema.optionalKey(RequestParams),
})
const decodeRequestLine = Schema.decodeUnknownEffect(Schema.fromJsonString(RequestLine))

const boardContent = ({
  snapshotSequence: _snapshotSequence,
  ...content
}: {
  snapshotSequence: unknown
}) => content
const transcriptTexts = (snapshot: ThreadSnapshot) =>
  snapshot.transcript.flatMap((item) => ("text" in item ? [item.text] : []))
const sessionRequests = (requests: ReadonlyArray<(typeof RequestLine)["Type"]>) =>
  requests.filter((request) => request.method?.startsWith("session/"))

const parseRequestLog = Effect.fn("parseRequestLog")(function* (requestLog: string) {
  const fs = yield* FileSystem.FileSystem
  const contents = yield* fs
    .readFileString(requestLog)
    .pipe(
      Effect.catchTag("PlatformError", (error) =>
        error.reason._tag === "NotFound" ? Effect.succeed("") : Effect.fail(error),
      ),
    )
  return yield* Effect.forEach(contents.split("\n").filter(Boolean), (line) =>
    decodeRequestLine(line),
  )
})

const waitForControl = Effect.fn("waitForControl")(function* (
  controlFile: string,
  predicate: (control: (typeof ControlFile)["Type"]) => boolean,
  label: string,
  attempts = 400,
) {
  const fs = yield* FileSystem.FileSystem
  let remaining = attempts
  while (remaining > 0) {
    const control = yield* fs
      .readFileString(controlFile)
      .pipe(Effect.flatMap(decodeControlFile), Effect.option)
    if (Option.isSome(control) && predicate(control.value)) {
      return control.value
    }
    remaining -= 1
    yield* Effect.sleep(25)
  }
  return yield* new SmokeError({ message: `Timed out waiting for ${label}` })
})

const run = Effect.fn("runDesktopSmoke")(function* () {
  assert.notEqual(
    process.platform,
    "win32",
    "The destructive child restart smoke runs on macOS/Linux",
  )

  const path = yield* Path.Path
  const fs = yield* FileSystem.FileSystem
  const fixturePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "server",
    "test",
    "fixtures",
    "fake-cursor-acp.mjs",
  )
  const temporaryDirectory = yield* fs.makeTempDirectory({ prefix: "noyau-durable-smoke-" })
  const fakeBinDirectory = path.join(temporaryDirectory, "bin")
  const profileDirectory = path.join(temporaryDirectory, "profile")
  const workspaceRoot = path.join(temporaryDirectory, "project")
  const controlFile = path.join(temporaryDirectory, "supervisor.json")
  const completeFile = path.join(temporaryDirectory, "complete")
  const requestLog = path.join(temporaryDirectory, "acp-requests.ndjson")
  const fakeCursorAgent = path.join(fakeBinDirectory, "cursor-agent")
  const inheritedPath = yield* Config.string("PATH").pipe(Config.withDefault(""))
  let desktopOutput = ""
  let electronHandle: ChildHandle | undefined
  let sentinelHandle: ChildHandle | undefined
  let shutdownEndpointRequestedAt: number | undefined

  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      if (electronHandle !== undefined) {
        const running = yield* electronHandle.isRunning.pipe(Effect.orElseSucceed(() => false))
        if (running) {
          yield* electronHandle.kill().pipe(Effect.ignore)
        }
      }
      if (sentinelHandle !== undefined) {
        const running = yield* sentinelHandle.isRunning.pipe(Effect.orElseSucceed(() => false))
        if (running) {
          yield* Stream.empty.pipe(Stream.run(sentinelHandle.stdin), Effect.ignore)
          yield* Effect.sleep(25)
          const stillRunning = yield* sentinelHandle.isRunning.pipe(
            Effect.orElseSucceed(() => false),
          )
          if (stillRunning) {
            yield* sentinelHandle.kill().pipe(Effect.ignore)
          }
        }
      }
      yield* fs.remove(temporaryDirectory, { recursive: true, force: true })
    }).pipe(Effect.ignore),
  )

  yield* fs.makeDirectory(fakeBinDirectory, { recursive: true })
  yield* fs.makeDirectory(profileDirectory, { recursive: true })
  yield* fs.makeDirectory(workspaceRoot, { recursive: true })
  // Wrapper only: the fixture imports `effect`. Copied into /tmp it cannot
  // resolve the monorepo, so the sentinel exits before the first assert.
  const fixtureHref = pathToFileURL(fixturePath)
    .href.replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
  yield* fs.writeFileString(fakeCursorAgent, `#!/usr/bin/env node\nimport "${fixtureHref}"\n`)
  yield* fs.chmod(fakeCursorAgent, 0o755)

  const fakeEnvironment = {
    PATH: `${fakeBinDirectory}:${inheritedPath}`,
    NOYAU_CURSOR_PATH: fakeCursorAgent,
    NOYAU_FAKE_ACP_SCENARIO: "cancel",
    NOYAU_FAKE_ACP_SESSION_ID: "durable-smoke-session",
  }
  sentinelHandle = yield* ChildProcess.make(fakeCursorAgent, [], {
    extendEnv: true,
    env: fakeEnvironment,
    stdin: "pipe",
    stdout: "ignore",
    stderr: "ignore",
  })
  yield* Effect.sleep(50)
  assert.equal(yield* sentinelHandle.isRunning, true, "foreign cursor-agent sentinel must be alive")

  const electronArguments = [`--user-data-dir=${profileDirectory}`, "dist-electron/main.cjs"]
  const launch = yield* resolveElectronLaunchCommand(electronArguments, "latest")
  const executable = process.platform === "linux" ? "xvfb-run" : launch.electronPath
  const executableArguments =
    process.platform === "linux"
      ? ["-a", launch.electronPath, "--no-sandbox", ...electronArguments]
      : [...launch.args]
  electronHandle = yield* ChildProcess.make(executable, executableArguments, {
    cwd: desktopDir,
    extendEnv: true,
    env: {
      ...fakeEnvironment,
      ELECTRON_RUN_AS_NODE: undefined,
      NOYAU_RELEASE_CHANNEL: "latest",
      NOYAU_DESKTOP_SMOKE_TEST: "1",
      NOYAU_DESKTOP_SMOKE_CONTROL_FILE: controlFile,
      NOYAU_DESKTOP_SMOKE_COMPLETE_FILE: completeFile,
      NOYAU_FAKE_ACP_REQUEST_LOG: requestLog,
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  yield* Stream.decodeText(electronHandle.stdout).pipe(
    Stream.runForEach((text) =>
      Effect.gen(function* () {
        desktopOutput += text
        if (
          shutdownEndpointRequestedAt === undefined &&
          text.includes("NOYAU_DESKTOP_SHUTDOWN_ENDPOINT_REQUESTED")
        ) {
          shutdownEndpointRequestedAt = yield* Clock.currentTimeMillis
        }
      }),
    ),
    Effect.forkDetach,
  )
  yield* Stream.decodeText(electronHandle.stderr).pipe(
    Stream.runForEach((text) =>
      Effect.sync(() => {
        desktopOutput += text
      }),
    ),
    Effect.forkDetach,
  )
  const electronExit = electronHandle.exitCode.pipe(
    Effect.map((code) => exited(Number(code), null)),
    Effect.catch((error) =>
      Effect.succeed(exited(null, /signal: '([A-Z0-9]+)'/u.exec(String(error))?.[1] ?? "unknown")),
    ),
  )
  yield* electronHandle.kill().pipe(Effect.delay(60_000), Effect.ignore, Effect.forkDetach)

  const initialControl = yield* waitForControl(
    controlFile,
    (control) =>
      control.state.phase === "ready" &&
      Number.isInteger(control.state.pid) &&
      control.bootstrap !== null,
    "initial Electron-supervised server",
  )
  const initialPid = initialControl.state.pid
  const initialBootstrap = initialControl.bootstrap
  if (initialPid === undefined || initialBootstrap === null) {
    return yield* new SmokeError({ message: "Initial supervisor control is incomplete" })
  }
  const initial = yield* Effect.promise(() => startInitialJourney(initialBootstrap, workspaceRoot))
  const initialRequests = yield* parseRequestLog(requestLog)
  assert.equal(
    sessionRequests(initialRequests).filter((request) => request.method === "session/new").length,
    1,
  )
  assert.equal(
    sessionRequests(initialRequests).filter((request) => request.method === "session/prompt")
      .length,
    1,
  )

  process.kill(initialPid, "SIGKILL")
  const restartedControl = yield* waitForControl(
    controlFile,
    (control) =>
      control.state.phase === "ready" &&
      Number.isInteger(control.state.pid) &&
      control.state.pid !== initialPid &&
      control.bootstrap !== null,
    "the restarted Electron-supervised server child",
  )
  const restartedBootstrap = restartedControl.bootstrap
  if (restartedBootstrap === null) {
    return yield* new SmokeError({ message: "Restarted supervisor control is incomplete" })
  }
  const recovered = yield* Effect.promise(() => readRecoveredJourney(restartedBootstrap))

  assert.deepEqual(boardContent(recovered.board), boardContent(initial.board))
  assert.equal(recovered.thread.thread.id, initial.thread.thread.id)
  assert.equal(recovered.thread.thread.title, initial.thread.thread.title)
  assert.deepEqual(recovered.thread.transcript, initial.thread.transcript)
  assert.deepEqual(recovered.thread.session?.resumeCursor, initial.thread.session?.resumeCursor)
  assert.match(recovered.thread.session?.lastError ?? "", /server restart/i)
  assert.equal(yield* sentinelHandle.isRunning, true, "server restart must not sweep cursor-agent")

  const requestsAfterRecovery = yield* parseRequestLog(requestLog)
  assert.equal(
    sessionRequests(requestsAfterRecovery).filter((request) => request.method === "session/prompt")
      .length,
    1,
    "boot must not replay the first prompt",
  )
  assert.equal(
    sessionRequests(requestsAfterRecovery).filter((request) => request.method === "session/load")
      .length,
    0,
    "boot recovery must not call session/load",
  )

  const resumed = yield* Effect.promise(() => resumeJourney(restartedBootstrap))
  assert.deepEqual(resumed.session?.resumeCursor, recovered.thread.session?.resumeCursor)
  assert.doesNotMatch(transcriptTexts(resumed).join("\n"), /replayed text|load-gated text/)

  const finalRequests = yield* parseRequestLog(requestLog)
  const finalSessionRequests = sessionRequests(finalRequests)
  const prompts = finalSessionRequests.filter((request) => request.method === "session/prompt")
  const loads = finalSessionRequests.filter((request) => request.method === "session/load")
  const news = finalSessionRequests.filter((request) => request.method === "session/new")
  assert.equal(prompts.length, 2, "each human Turn sends exactly one prompt")
  const firstLoad = loads[0]
  const secondPrompt = prompts[1]
  if (firstLoad === undefined || secondPrompt === undefined) {
    return yield* new SmokeError({ message: "Expected session/load then the second prompt" })
  }
  assert.deepEqual(
    prompts.map((request) => request.params?.prompt?.[0]?.text),
    [durableJourney.firstPrompt, durableJourney.secondPrompt],
  )
  assert.equal(loads.length, 1)
  assert.equal(firstLoad.params?.sessionId, "durable-smoke-session")
  assert.equal(news.length, 1, "resume must not fall back to session/new")
  assert.ok(finalSessionRequests.indexOf(firstLoad) < finalSessionRequests.indexOf(secondPrompt))
  assert.equal(yield* sentinelHandle.isRunning, true, "foreign cursor-agent must remain alive")

  yield* fs.writeFileString(completeFile, "complete\n")
  const exit = yield* electronExit
  const now = yield* Clock.currentTimeMillis
  const shutdownDuration =
    shutdownEndpointRequestedAt === undefined
      ? undefined
      : Math.round(now - shutdownEndpointRequestedAt)
  assert.equal(exit.code, 0, `Electron exited via ${String(exit.signal)}\n${desktopOutput}`)
  assert.match(desktopOutput, /NOYAU_DESKTOP_SMOKE_TEST_OK/)
  assert.ok(shutdownDuration !== undefined && shutdownDuration < 2_000)

  yield* Effect.sync(() => {
    process.stdout.write(
      [
        "Noyau Desktop durable smoke passed:",
        `  server child ${initialPid} restarted as ${restartedControl.state.pid}`,
        "  Board and transcript persisted; running Session recovered to error",
        "  resumeCursor persisted; next Turn used session/load without replay",
        `  foreign cursor-agent survived; shutdown completed in ${shutdownDuration}ms`,
      ].join("\n") + "\n",
    )
  })
})

void scriptRuntime.runPromise(Effect.scoped(run())).catch((cause: unknown) => {
  process.stderr.write(`Noyau Desktop smoke test failed.\n${inspect(cause, { depth: 8 })}\n`)
  process.exit(1)
})
