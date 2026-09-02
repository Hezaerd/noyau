import { fileURLToPath } from "node:url"

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, layer } from "@effect/vitest"
import { ProviderDriverKind, ProviderInstanceId } from "@noyau/contracts/entities/environment"
import {
  ApprovalRequestId,
  ProjectId,
  ProviderSessionId,
  ThreadId,
  TurnId,
} from "@noyau/contracts/ids"
import type { McpInvocationScope } from "@noyau/server/mcp/mcp-invocation-context"
import { McpSessionRegistry } from "@noyau/server/mcp/mcp-session-registry"
import {
  codexProviderLayer,
  resolveCodexExecutable,
  type CodexAdapterOptions,
} from "@noyau/server/provider/codex-app-server"
import {
  ProviderPort,
  type ProviderForkInput,
  type ProviderSignal,
  type ProviderTurnInput,
} from "@noyau/server/provider/provider-port"
import { TurnUserInputRegistry } from "@noyau/server/provider/turn-user-input-registry"
import { Clock, Deferred, Effect, Fiber, FileSystem, Layer, Option, Path, Schema } from "effect"
import { TestClock } from "effect/testing"

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
const testMcpSessionsLayer = (onRevoke: (threadId: ThreadId) => void = () => undefined) =>
  Layer.succeed(McpSessionRegistry)({
    issue: () => Effect.succeed(staticMcpCredential),
    resolve: () => Effect.succeed(missingMcpScope),
    activateTurn: () => Effect.void,
    deactivateTurn: () => Effect.void,
    touchSession: () => Effect.succeed(true),
    revokeSession: (revokedThreadId) => Effect.sync(() => onRevoke(revokedThreadId)),
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
  provider: ProviderInstanceId.make("codex"),
  text: "Implement the adapter",
  workspaceRoot: process.cwd(),
  runtimeMode,
  modelSelection,
  resumeCursor,
})

const forkInput = (): ProviderForkInput => ({
  projectId,
  threadId: ThreadId.make("20000000-0000-4000-8000-000000000003"),
  sourceThreadId: threadId,
  sourceTurnId: turnId,
  provider: ProviderInstanceId.make("codex"),
  workspaceRoot: process.cwd(),
  sourceResumeCursor: { schemaVersion: 1, sessionId: ProviderSessionId.make("fake-codex-thread") },
  sourceForkPoint: { schemaVersion: 1, boundaryId: "fake-codex-turn-1" },
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
    evidence: {
      readonly requestLog: string
      readonly exitLog: string
      readonly revokedSessions: ReadonlyArray<ThreadId>
    },
    userInputs: TurnUserInputRegistry["Service"],
  ) => Effect.Effect<A, E, R>,
  optionOverrides: Partial<CodexAdapterOptions> = {},
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const evidence = yield* makeOptions(scenario)
      const revokedSessions: Array<ThreadId> = []
      const services = yield* Layer.build(
        codexProviderLayer({ ...evidence.options, ...optionOverrides }).pipe(
          Layer.provide(
            testMcpSessionsLayer((revokedThreadId) => revokedSessions.push(revokedThreadId)),
          ),
        ),
      )
      return yield* Effect.gen(function* () {
        const provider = yield* ProviderPort
        const userInputs = yield* TurnUserInputRegistry
        return yield* use(provider, { ...evidence, revokedSessions }, userInputs)
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
  id: Schema.optionalKey(Schema.Union([Schema.Finite, Schema.String])),
  method: Schema.optionalKey(Schema.String),
  argv: Schema.optionalKey(Schema.Array(Schema.String)),
  envToken: Schema.optionalKey(Schema.NullOr(Schema.String)),
  params: Schema.optionalKey(Schema.Unknown),
  result: Schema.optionalKey(Schema.Unknown),
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

const endedBeforeReady = (signals: ReadonlyArray<ProviderSignal>) => {
  const ended = signals.findLastIndex((signal) => signal._tag === "turn-ended")
  const ready = signals.findLastIndex(
    (signal) => signal._tag === "session" && signal.status === "ready",
  )
  return ended !== -1 && ready !== -1 && ended < ready
}

const waitForLog = Effect.fn("CodexAdapterTest.waitForLog")((filePath: string, snippet: string) =>
  TestClock.withLive(
    Effect.gen(function* () {
      const deadline = (yield* Clock.currentTimeMillis) + 2_000
      while ((yield* Clock.currentTimeMillis) < deadline) {
        const log = yield* readLog(filePath).pipe(Effect.orElseSucceed(() => ""))
        if (log.includes(snippet)) {
          return log
        }
        yield* Effect.sleep("20 millis")
      }
      return yield* Effect.die(`request log never contained ${snippet}`)
    }),
  ),
)

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
              assert.deepStrictEqual(Object.keys(status), ["codex"])
              assert.deepStrictEqual(status[ProviderInstanceId.make("codex")], {
                instanceId: ProviderInstanceId.make("codex"),
                driver: ProviderDriverKind.make("codex"),
                enabled: true,
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
                  {
                    modelId: "gpt-4",
                    label: "GPT-4",
                    isLegacy: true,
                    reasoningEfforts: [
                      { value: "low", label: "low", description: "Low", isDefault: true },
                    ],
                    serviceTiers: [],
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
              assert.deepStrictEqual(status[ProviderInstanceId.make("codex")], {
                instanceId: ProviderInstanceId.make("codex"),
                driver: ProviderDriverKind.make("codex"),
                enabled: true,
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

  it.effect("lists enabled skills that expose OpenAI interface metadata", () =>
    withProvider("success", (provider) =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const workspace = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "noyau-codex-skills-",
        })
        const skillRoot = path.join(workspace, ".agents", "skills", "test-skill")
        yield* fileSystem.makeDirectory(path.join(skillRoot, "agents"), { recursive: true })
        yield* fileSystem.writeFileString(path.join(skillRoot, "SKILL.md"), "# Test skill\n")
        yield* fileSystem.writeFileString(
          path.join(skillRoot, "agents", "openai.yaml"),
          'interface:\n  display_name: "Test Skill"\n',
        )

        assert.deepStrictEqual(
          yield* provider.listSkills(ProviderInstanceId.make("codex"), workspace),
          [
            {
              name: "test-skill",
              displayName: "Test Skill",
              description: "Use the test workflow",
              scope: "repo",
            },
          ],
        )
      }),
    ),
  )

  it.effect("stops skill discovery when Codex does not respond", () =>
    withProvider("skills-hang", (provider, evidence) =>
      Effect.gen(function* () {
        const fiber = yield* provider
          .listSkills(ProviderInstanceId.make("codex"), process.cwd())
          .pipe(Effect.forkChild)
        yield* waitForLog(evidence.requestLog, '"method":"skills/list"')
        yield* TestClock.adjust("10 seconds")
        assert.deepStrictEqual(yield* Fiber.join(fiber), [])
      }),
    ),
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

  it.effect("keeps the Turn alive until a pending batched user input resolves", () =>
    withProvider(
      "pending-user-input-settlement",
      (provider, evidence, userInputs) =>
        Effect.gen(function* () {
          const signals: Array<ProviderSignal> = []
          const pendingVisible = yield* Deferred.make<void>()
          yield* provider.startTurn(input(), (signal) => {
            const record = Effect.sync(() => {
              signals.push(signal)
            })
            return signal._tag === "transcript" &&
              signal.item._tag === "transcript.user-input" &&
              signal.item.status === "pending"
              ? record.pipe(Effect.andThen(Deferred.succeed(pendingVisible, undefined)))
              : record
          })
          yield* waitForLog(evidence.requestLog, '"method":"turn/start"')

          const requestId = ApprovalRequestId.make("pending-question-batch")
          const request = yield* userInputs
            .request({
              threadId,
              turnId,
              requestId,
              questions: [
                {
                  id: "runtime",
                  prompt: "Which runtime?",
                  options: [
                    { id: "bun", label: "Bun" },
                    { id: "node", label: "Node" },
                  ],
                },
                {
                  id: "surface",
                  prompt: "Which surface?",
                  options: [
                    { id: "web", label: "Web" },
                    { id: "desktop", label: "Desktop" },
                  ],
                },
              ],
            })
            .pipe(Effect.forkChild)
          yield* Deferred.await(pendingVisible)

          yield* TestClock.adjust("1 second")
          yield* waitForLog(evidence.requestLog, '"method":"thread/read"')
          assert.isFalse(signals.some((signal) => signal._tag === "turn-ended"))

          const answers = {
            runtime: { optionIds: ["bun"] },
            surface: { optionIds: ["web", "desktop"] },
          }
          yield* provider.respondUserInput(threadId, requestId, answers)
          assert.deepStrictEqual(yield* Fiber.join(request), answers)
          yield* provider.drain

          const pendingIndex = signals.findIndex(
            (signal) =>
              signal._tag === "transcript" &&
              signal.item._tag === "transcript.user-input" &&
              signal.item.status === "pending",
          )
          const resolvedIndex = signals.findIndex(
            (signal) =>
              signal._tag === "transcript" &&
              signal.item._tag === "transcript.user-input" &&
              signal.item.status === "resolved",
          )
          const endedIndex = signals.findIndex((signal) => signal._tag === "turn-ended")
          assert.isTrue(
            pendingIndex !== -1 && resolvedIndex > pendingIndex && endedIndex > resolvedIndex,
          )
        }),
      { turnReconcileInterval: "1 second" },
    ),
  )

  it.effect("answers a detached Codex user-input request without resolving it", () =>
    withProvider("closed-user-input-response", (provider, evidence, userInputs) =>
      Effect.gen(function* () {
        const signals: Array<ProviderSignal> = []
        const pendingVisible = yield* Deferred.make<void>()
        yield* provider.startTurn(input(), (signal) => {
          const record = Effect.sync(() => {
            signals.push(signal)
          })
          return signal._tag === "transcript" &&
            signal.item._tag === "transcript.user-input" &&
            signal.item.requestId === "closed-question-batch" &&
            signal.item.status === "pending"
            ? record.pipe(Effect.andThen(Deferred.succeed(pendingVisible, undefined)))
            : record
        })
        yield* Deferred.await(pendingVisible)

        yield* userInputs.closeTurn(threadId, turnId, "detach")
        const log = yield* waitForLog(evidence.requestLog, '"id":9001,"result":{"answers":{}}')
        const response = parseRequests(log).find((message) => message.id === 9_001)

        assert.deepStrictEqual(response?.result, { answers: {} })
        assert.isTrue(
          signals.some(
            (signal) =>
              signal._tag === "user-input-detached" && signal.requestId === "closed-question-batch",
          ),
        )
        assert.isFalse(
          signals.some(
            (signal) =>
              signal._tag === "transcript" &&
              signal.item._tag === "transcript.user-input" &&
              signal.item.requestId === "closed-question-batch" &&
              signal.item.status === "resolved",
          ),
        )

        yield* provider.interrupt(threadId)
        yield* provider.drain
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
        assert.strictEqual(
          requests.filter((message) => message.method === "config/mcpServer/reload").length,
          1,
        )
        assert.isTrue(
          first.some((signal) => signal._tag === "turn-ended" && signal.state === "completed"),
        )
        assert.isTrue(
          second.some((signal) => signal._tag === "turn-ended" && signal.state === "completed"),
        )
        assert.isTrue(endedBeforeReady(first))
        assert.isTrue(endedBeforeReady(second))

        const exitsBeforeStop = (yield* readLog(evidence.exitLog)).split("SIGTERM").length - 1
        yield* provider.stop(threadId)
        const exitLog = yield* waitForLog(evidence.exitLog, "SIGTERM")
        const exitsAfterStop = exitLog.split("SIGTERM").length - 1
        assert.strictEqual(exitsAfterStop, exitsBeforeStop + 1)
      }),
    ),
  )

  it.effect(
    "resumes a Codex thread after stop, and never replaces a failed resume with a new thread",
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
              signals.some((signal) => signal._tag === "turn-ended" && signal.state === "error"),
            )
            const requests = parseRequests(yield* readLog(evidence.requestLog))
            assert.isTrue(requests.some((message) => message.method === "thread/resume"))
            assert.isFalse(requests.some((message) => message.method === "thread/start"))
          }),
        )
      }),
  )

  it.effect("isolates child-thread notifications from the active root Turn", () =>
    withProvider("cross-talk", (provider) =>
      Effect.gen(function* () {
        const signals = yield* capture(provider, input())
        const assistantTexts = signals.flatMap((signal) =>
          signal._tag === "transcript" && signal.item._tag === "transcript.assistant"
            ? [signal.item.text]
            : [],
        )
        assert.deepStrictEqual(assistantTexts, ["hello from fake Codex"])
        assert.deepStrictEqual(
          signals.flatMap((signal) => (signal._tag === "turn-ended" ? [signal.state] : [])),
          ["completed"],
        )
        assert.isFalse(signals.some((signal) => signal._tag === "context-usage"))
      }),
    ),
  )

  it.effect("coalesces root context usage and flushes the latest value before settlement", () =>
    withProvider("usage-burst", (provider) =>
      Effect.gen(function* () {
        const signals = yield* capture(provider, input())
        const usage = signals.flatMap((signal) =>
          signal._tag === "context-usage" ? [{ used: signal.used, window: signal.window }] : [],
        )
        assert.deepStrictEqual(usage, [{ used: 10, window: 100 }])
        const usageIndex = signals.findIndex((signal) => signal._tag === "context-usage")
        const terminalIndex = signals.findIndex((signal) => signal._tag === "turn-ended")
        assert.isTrue(usageIndex !== -1 && terminalIndex !== -1 && usageIndex < terminalIndex)
      }),
    ),
  )

  it.effect("settles an interrupted Turn when Codex never sends turn/completed", () =>
    withProvider("hang-no-completion", (provider, evidence) =>
      Effect.gen(function* () {
        const signals: Array<ProviderSignal> = []
        yield* provider.startTurn(input(), (signal) =>
          Effect.sync(() => {
            signals.push(signal)
          }),
        )
        yield* waitForLog(evidence.requestLog, '"method":"turn/start"')
        yield* provider.interrupt(threadId)
        yield* provider.drain

        assert.deepStrictEqual(
          signals.flatMap((signal) => (signal._tag === "turn-ended" ? [signal.state] : [])),
          ["interrupted"],
        )
        assert.isTrue(
          signals.some((signal) => signal._tag === "session" && signal.status === "ready"),
        )

        yield* waitForLog(evidence.exitLog, "SIGTERM")
      }),
    ),
  )

  it.effect("owns the forked thread on its destination client through the first Turn", () =>
    withProvider("success", (provider, evidence) =>
      Effect.gen(function* () {
        yield* capture(provider, input())
        const before = parseRequests(yield* readLog(evidence.requestLog))
        const fork = forkInput()
        const cursor = yield* provider.fork!(fork)
        assert.strictEqual(cursor.sessionId, "forked-fake-codex-thread")
        const destinationSignals = yield* capture(provider, {
          ...input(),
          threadId: fork.threadId,
          turnId: secondTurnId,
          text: "Continue from the native fork",
          resumeCursor: cursor,
        })
        assert.isTrue(
          destinationSignals.some(
            (signal) => signal._tag === "turn-ended" && signal.state === "completed",
          ),
        )
        const requests = parseRequests(yield* readLog(evidence.requestLog))
        const forkRequest = requests.find((request) => request.method === "thread/fork")
        assert.deepStrictEqual(forkRequest?.params, {
          threadId: "fake-codex-thread",
          lastTurnId: "fake-codex-turn-1",
          cwd: process.cwd(),
        })
        assert.strictEqual(
          requests.filter((request) => request.method === "_spawn").length,
          before.filter((request) => request.method === "_spawn").length + 1,
        )
        assert.strictEqual(
          requests.filter((request) => request.method === "thread/start").length,
          before.filter((request) => request.method === "thread/start").length,
        )
        assert.strictEqual(
          requests.filter((request) => request.method === "thread/resume").length,
          before.filter((request) => request.method === "thread/resume").length,
        )
        assert.isTrue(
          requests.some(
            (request) =>
              request.method === "turn/start" &&
              JSON.stringify(request.params).includes('"threadId":"forked-fake-codex-thread"'),
          ),
        )
      }),
    ),
  )

  it.effect("creates an owned destination client after the source session was reaped", () =>
    withProvider("success", (provider, evidence) =>
      Effect.gen(function* () {
        yield* capture(provider, input())
        assert.isTrue(yield* provider.reapIdle(threadId))
        const exitsAfterSourceReap = (yield* readLog(evidence.exitLog)).split("SIGTERM").length - 1
        const before = parseRequests(yield* readLog(evidence.requestLog))
        const fork = forkInput()
        const cursor = yield* provider.fork!(fork)
        assert.strictEqual(cursor.sessionId, "forked-fake-codex-thread")
        const requests = parseRequests(yield* readLog(evidence.requestLog))
        assert.strictEqual(
          requests.filter((request) => request.method === "_spawn").length,
          before.filter((request) => request.method === "_spawn").length + 1,
        )
        const forkRequest = requests.findLast((request) => request.method === "thread/fork")
        assert.deepStrictEqual(forkRequest?.params, {
          threadId: "fake-codex-thread",
          lastTurnId: "fake-codex-turn-1",
          cwd: process.cwd(),
        })
        yield* provider.stop(fork.threadId)
        const exitLog = yield* waitForLog(evidence.exitLog, "SIGTERM")
        assert.strictEqual(exitLog.split("SIGTERM").length - 1, exitsAfterSourceReap + 1)
      }),
    ),
  )

  it.effect("resumes the persisted fork after its owned destination client is reaped", () =>
    withProvider("success", (provider, evidence) =>
      Effect.gen(function* () {
        const fork = forkInput()
        const cursor = yield* provider.fork!(fork)
        yield* capture(provider, {
          ...input(),
          threadId: fork.threadId,
          turnId: secondTurnId,
          resumeCursor: cursor,
        })
        assert.isTrue(yield* provider.reapIdle(fork.threadId))
        const before = parseRequests(yield* readLog(evidence.requestLog))
        const thirdTurnId = TurnId.make("30000000-0000-4000-8000-000000000004")
        const signals = yield* capture(provider, {
          ...input(),
          threadId: fork.threadId,
          turnId: thirdTurnId,
          resumeCursor: cursor,
        })
        assert.isTrue(
          signals.some((signal) => signal._tag === "turn-ended" && signal.state === "completed"),
        )
        const requests = parseRequests(yield* readLog(evidence.requestLog))
        assert.strictEqual(
          requests.filter((request) => request.method === "thread/resume").length,
          before.filter((request) => request.method === "thread/resume").length + 1,
        )
        assert.strictEqual(
          requests.filter((request) => request.method === "thread/start").length,
          before.filter((request) => request.method === "thread/start").length,
        )
      }),
    ),
  )

  it.effect("rejects a native fork whose returned history ends at another Turn", () =>
    withProvider("fork-wrong-boundary", (provider, evidence) =>
      Effect.gen(function* () {
        const fork = forkInput()
        const failure = yield* Effect.flip(provider.fork!(fork))
        assert.strictEqual(failure._tag, "ProviderForkUnavailable")
        assert.match(failure.message, /wrong Turn boundary/)
        assert.deepStrictEqual(evidence.revokedSessions, [fork.threadId])
      }),
    ),
  )

  it.effect("reconciles an idle Codex Turn when turn/completed is missing", () =>
    withProvider(
      "idle-without-turn-completed",
      (provider, evidence) =>
        Effect.gen(function* () {
          const signals: Array<ProviderSignal> = []
          yield* provider.startTurn(input(), (signal) =>
            Effect.sync(() => {
              signals.push(signal)
            }),
          )
          yield* waitForLog(evidence.requestLog, '"method":"turn/start"')
          yield* TestClock.adjust("1 second")
          yield* provider.drain

          assert.deepStrictEqual(
            signals.flatMap((signal) => (signal._tag === "turn-ended" ? [signal.state] : [])),
            ["completed"],
          )
          assert.isTrue(
            signals.some((signal) => signal._tag === "session" && signal.status === "ready"),
          )
          assert.isTrue(
            parseRequests(yield* readLog(evidence.requestLog)).some(
              (message) => message.method === "thread/read",
            ),
          )
        }),
      { turnReconcileInterval: "1 second" },
    ),
  )

  it.effect("keeps an active Codex Turn running during reconciliation", () =>
    withProvider(
      "hang-no-completion",
      (provider, evidence) =>
        Effect.gen(function* () {
          const signals: Array<ProviderSignal> = []
          yield* provider.startTurn(input(), (signal) =>
            Effect.sync(() => {
              signals.push(signal)
            }),
          )
          yield* waitForLog(evidence.requestLog, '"method":"turn/start"')
          yield* TestClock.adjust("1 second")
          yield* waitForLog(evidence.requestLog, '"method":"thread/read"')

          assert.isFalse(signals.some((signal) => signal._tag === "turn-ended"))

          yield* provider.interrupt(threadId)
          yield* provider.drain
          assert.deepStrictEqual(
            signals.flatMap((signal) => (signal._tag === "turn-ended" ? [signal.state] : [])),
            ["interrupted"],
          )
        }),
      { turnReconcileInterval: "1 second" },
    ),
  )

  it.effect("settles an active Turn when the Codex process exits", () =>
    withProvider("exit-active", (provider) =>
      Effect.gen(function* () {
        const signals = yield* capture(provider, input())
        assert.deepStrictEqual(
          signals.flatMap((signal) => (signal._tag === "turn-ended" ? [signal.state] : [])),
          ["error"],
        )
        assert.isTrue(
          signals.some((signal) => signal._tag === "session" && signal.status === "error"),
        )
        const terminalIndex = signals.findIndex((signal) => signal._tag === "turn-ended")
        assert.isFalse(
          signals
            .slice(terminalIndex + 1)
            .some((signal) => signal._tag === "session" && signal.status === "running"),
        )
      }),
    ),
  )

  it.effect("releases startup resources when Codex exits before Session assignment", () =>
    Effect.gen(function* () {
      for (const scenario of ["exit-during-initialize", "exit-during-thread-start"]) {
        yield* withProvider(scenario, (provider, evidence) =>
          Effect.gen(function* () {
            const signals = yield* capture(provider, input())
            assert.deepStrictEqual(
              signals.flatMap((signal) => (signal._tag === "turn-ended" ? [signal.state] : [])),
              ["error"],
            )
            assert.deepStrictEqual(evidence.revokedSessions, [threadId])
          }),
        )
      }
    }),
  )
})
