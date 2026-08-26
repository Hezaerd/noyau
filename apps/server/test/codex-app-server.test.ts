import { fileURLToPath } from "node:url"

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, layer } from "@effect/vitest"
import { emptyCursorProviderStatus } from "@noyau/protocol/entities/environment"
import { ProjectId, ProviderSessionId, ThreadId, TurnId } from "@noyau/protocol/ids"
import type { McpInvocationScope } from "@noyau/server/mcp/mcp-invocation-context"
import { McpSessionRegistry } from "@noyau/server/mcp/mcp-session-registry"
import {
  codexProviderLayer,
  resolveCodexExecutable,
  type CodexAdapterOptions,
} from "@noyau/server/provider/codex-app-server"
import {
  ProviderPort,
  type ProviderSignal,
  type ProviderTurnInput,
} from "@noyau/server/provider/provider-port"
import { Effect, FileSystem, Layer, Option, Path, Schema } from "effect"

const platformLayer = Layer.mergeAll(NodeFileSystem.layer, Path.layer)
const fakeCodex = fileURLToPath(new URL("./fixtures/fake-codex-app-server.mjs", import.meta.url))
const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const turnId = TurnId.make("30000000-0000-4000-8000-000000000001")
const secondTurnId = TurnId.make("30000000-0000-4000-8000-000000000002")
const missingMcpScope: McpInvocationScope | undefined = undefined
const staticMcpCredential = {
  config: {
    endpoint: "http://127.0.0.1:43123/mcp",
    authorizationHeader: "Bearer test-mcp-token",
  },
}
const testMcpSessionsLayer = Layer.succeed(McpSessionRegistry)({
  issue: () => Effect.succeed(staticMcpCredential),
  resolve: () => Effect.succeed(missingMcpScope),
  activateTurn: () => Effect.void,
  deactivateTurn: () => Effect.void,
  touchSession: () => Effect.succeed(true),
  revokeSession: () => Effect.void,
  revokeAll: Effect.void,
})

const input = (
  runtimeMode: ProviderTurnInput["runtimeMode"] = "full-access",
  resumeCursor: ProviderTurnInput["resumeCursor"] = null,
  modelSelection: ProviderTurnInput["modelSelection"] = null,
): ProviderTurnInput => ({
  projectId,
  threadId,
  turnId,
  provider: "codex",
  text: "Implement the adapter",
  workspaceRoot: process.cwd(),
  runtimeMode,
  modelSelection,
  resumeCursor,
})

const makeOptions = Effect.fn("CodexAdapterTest.makeOptions")(function* (scenario: string) {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-fake-codex-" })
  const requestLog = path.join(directory, "requests.ndjson")
  const exitLog = path.join(directory, "exit.log")
  return {
    requestLog,
    exitLog,
    options: {
      binaryPath: process.execPath,
      binaryArgs: [fakeCodex],
      environment: {
        PATH: "",
        NOYAU_FAKE_CODEX_SCENARIO: scenario,
        NOYAU_FAKE_CODEX_REQUEST_LOG: requestLog,
        NOYAU_FAKE_CODEX_EXIT_LOG: exitLog,
      },
    } satisfies CodexAdapterOptions,
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
      const services = yield* Layer.build(
        codexProviderLayer(evidence.options).pipe(Layer.provide(testMcpSessionsLayer)),
      )
      return yield* Effect.gen(function* () {
        const provider = yield* ProviderPort
        return yield* use(provider, evidence)
      }).pipe(Effect.provide(services))
    }),
  )

const capture = Effect.fn("CodexAdapterTest.capture")(function* (
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

const readLog = Effect.fn("CodexAdapterTest.readLog")(function* (filePath: string) {
  const fileSystem = yield* FileSystem.FileSystem
  return yield* fileSystem.readFileString(filePath)
})

const LoggedRequest = Schema.Struct({
  method: Schema.optionalKey(Schema.String),
  argv: Schema.optionalKey(Schema.Array(Schema.String)),
  envToken: Schema.optionalKey(Schema.NullOr(Schema.String)),
  params: Schema.optionalKey(Schema.Unknown),
})
const decodeLoggedRequest = Schema.decodeUnknownOption(LoggedRequest)

const parseRequests = (log: string) =>
  log
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      const decoded = decodeLoggedRequest(JSON.parse(line))
      return Option.isSome(decoded) ? [decoded.value] : []
    })

const resumeFrom = (signals: ReadonlyArray<ProviderSignal>) => {
  const session = signals.findLast((signal) => signal._tag === "session")
  return session?._tag === "session" ? session.resumeCursor : null
}

const waitForLog = Effect.fn("CodexAdapterTest.waitForLog")(function* (
  filePath: string,
  snippet: string,
) {
  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    const log = yield* readLog(filePath).pipe(Effect.orElseSucceed(() => ""))
    if (log.includes(snippet)) {
      return log
    }
    yield* Effect.promise(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 20)
        }),
    )
  }
  return yield* Effect.die(`request log never contained ${snippet}`)
})

layer(platformLayer)("Codex app-server adapter", (it) => {
  it.effect("prefers an explicit configured path, then PATH, then a bare fallback", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-codex-path-" })
      const pathExecutable = path.join(directory, "codex")
      const configured = path.join(directory, "configured-codex")
      yield* fileSystem.writeFileString(pathExecutable, "#!/bin/sh\nexit 0\n")
      yield* fileSystem.writeFileString(configured, "#!/bin/sh\nexit 0\n")
      yield* fileSystem.chmod(pathExecutable, 0o755)
      yield* fileSystem.chmod(configured, 0o755)

      assert.strictEqual(
        yield* resolveCodexExecutable(configured, { PATH: directory }, "linux"),
        configured,
      )
      assert.strictEqual(
        yield* resolveCodexExecutable("codex", { PATH: directory }, "linux"),
        pathExecutable,
      )
      assert.strictEqual(
        yield* resolveCodexExecutable(configured, { PATH: "" }, "linux"),
        configured,
      )
    }),
  )

  it.effect("uses initialize, account, and model/list as provider truth", () =>
    Effect.gen(function* () {
      yield* withProvider("success", (provider) =>
        provider.status.pipe(
          Effect.tap((status) =>
            Effect.sync(() => {
              assert.deepStrictEqual(status.cursor, emptyCursorProviderStatus)
              assert.deepStrictEqual(status.codex, {
                installed: true,
                handshakeOk: true,
                version: "fake-codex-app-server",
                plan: "plus",
                binaryPath: process.execPath,
                models: [
                  {
                    modelId: "gpt-5",
                    label: "GPT-5",
                    reasoningEfforts: [
                      { value: "low", label: "low", description: "Low" },
                      { value: "medium", label: "medium", description: "Medium", isDefault: true },
                      { value: "high", label: "high", description: "High" },
                    ],
                    serviceTiers: [
                      { value: "standard", label: "Standard", isDefault: true },
                      { value: "fast", label: "Fast" },
                    ],
                  },
                ],
              })
            }),
          ),
        ),
      )
      yield* withProvider("handshake-fail", (provider) =>
        provider.status.pipe(
          Effect.tap((status) =>
            Effect.sync(() => {
              assert.deepStrictEqual(status.codex, {
                installed: true,
                handshakeOk: false,
                version: null,
                plan: null,
                binaryPath: process.execPath,
                models: [],
              })
            }),
          ),
        ),
      )
    }),
  )

  it.effect("maps deltas, tools, plan, and turn/completed to Noyau signals", () =>
    withProvider("success", (provider, evidence) =>
      Effect.gen(function* () {
        const signals = yield* capture(provider, input())
        assert.isTrue(
          signals.some((signal) => signal._tag === "session" && signal.status === "running"),
        )
        const assistantTexts = signals.flatMap((signal) =>
          signal._tag === "transcript" && signal.item._tag === "transcript.assistant"
            ? [signal.item.text]
            : [],
        )
        assert.deepStrictEqual(assistantTexts, ["hello from fake Codex"])
        assert.isTrue(
          signals.some(
            (signal) =>
              signal._tag === "transcript" &&
              signal.item._tag === "transcript.tool" &&
              signal.item.status === "completed" &&
              signal.item.name === "ls" &&
              signal.item.action === "command",
          ),
        )
        assert.isTrue(
          signals.some(
            (signal) =>
              signal._tag === "transcript" &&
              signal.item._tag === "transcript.tool" &&
              signal.item.status === "completed" &&
              signal.item.name === "webSearch" &&
              signal.item.action === "search",
          ),
        )
        assert.isTrue(
          signals.some(
            (signal) =>
              signal._tag === "transcript" &&
              signal.item._tag === "transcript.plan" &&
              signal.item.markdown.includes("Inspect state"),
          ),
        )
        assert.isTrue(
          signals.some((signal) => signal._tag === "turn-ended" && signal.state === "completed"),
        )
        const requests = parseRequests(yield* readLog(evidence.requestLog))
        const spawn = requests.find(
          (message) => message.method === "_spawn" && message.envToken !== null,
        )
        assert.isTrue(spawn?.argv?.some((arg) => arg.includes("mcp_servers.noyau.url=")))
        assert.isTrue(
          spawn?.argv?.some((arg) =>
            arg.includes('mcp_servers.noyau.bearer_token_env_var="NOYAU_MCP_BEARER_TOKEN"'),
          ),
        )
        assert.strictEqual(spawn?.envToken, "test-mcp-token")
        assert.isTrue(requests.some((message) => message.method === "config/mcpServer/reload"))
      }),
    ),
  )

  it.effect("keeps one app-server process across Turns and closes it on session stop", () =>
    withProvider("success", (provider, evidence) =>
      Effect.gen(function* () {
        const first = yield* capture(provider, input())
        const second = yield* capture(provider, {
          ...input(),
          turnId: secondTurnId,
          text: "Continue the adapter",
        })

        const requests = parseRequests(yield* readLog(evidence.requestLog))
        assert.strictEqual(requests.filter((message) => message.method === "initialize").length, 2)
        assert.strictEqual(
          requests.filter((message) => message.method === "thread/start").length,
          1,
        )
        assert.strictEqual(requests.filter((message) => message.method === "turn/start").length, 2)
        assert.isTrue(
          first.some((signal) => signal._tag === "turn-ended" && signal.state === "completed"),
        )
        assert.isTrue(
          second.some((signal) => signal._tag === "turn-ended" && signal.state === "completed"),
        )

        const exitsBeforeStop = (yield* readLog(evidence.exitLog)).split("SIGTERM").length - 1
        yield* provider.stop(threadId)
        const exitLog = yield* waitForLog(evidence.exitLog, "SIGTERM")
        const exitsAfterStop = exitLog.split("SIGTERM").length - 1
        assert.strictEqual(exitsAfterStop, exitsBeforeStop + 1)
      }),
    ),
  )

  it.effect(
    "resumes a Codex thread after stop, and falls back to thread/start when resume fails",
    () =>
      Effect.gen(function* () {
        yield* withProvider("success", (provider, evidence) =>
          Effect.gen(function* () {
            const first = yield* capture(provider, input())
            const resumeCursor = resumeFrom(first)
            assert.isNotNull(resumeCursor)
            yield* provider.stop(threadId)
            yield* waitForLog(evidence.exitLog, "SIGTERM")
            const second = yield* capture(provider, {
              ...input(),
              turnId: secondTurnId,
              resumeCursor,
            })
            assert.isTrue(
              second.some((signal) => signal._tag === "turn-ended" && signal.state === "completed"),
            )
            const requests = parseRequests(yield* readLog(evidence.requestLog))
            assert.isTrue(requests.some((message) => message.method === "thread/resume"))
          }),
        )

        yield* withProvider("resume-missing", (provider, evidence) =>
          Effect.gen(function* () {
            const signals = yield* capture(provider, {
              ...input(),
              resumeCursor: {
                schemaVersion: 1,
                sessionId: ProviderSessionId.make("missing-codex-thread"),
              },
            })
            assert.isTrue(
              signals.some(
                (signal) => signal._tag === "turn-ended" && signal.state === "completed",
              ),
            )
            const requests = parseRequests(yield* readLog(evidence.requestLog))
            assert.isTrue(requests.some((message) => message.method === "thread/resume"))
            assert.isTrue(requests.some((message) => message.method === "thread/start"))
          }),
        )
      }),
  )
})
