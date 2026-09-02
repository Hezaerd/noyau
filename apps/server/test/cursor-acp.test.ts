import { fileURLToPath } from "node:url"

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, layer } from "@effect/vitest"
import { ProviderDriverKind, ProviderInstanceId } from "@noyau/contracts/entities/environment"
import {
  ApprovalRequestId,
  ProjectId,
  AttachmentId,
  ProviderSessionId,
  ThreadId,
  TurnId,
} from "@noyau/contracts/ids"
import type { McpInvocationScope } from "@noyau/server/mcp/mcp-invocation-context"
import { McpSessionRegistry } from "@noyau/server/mcp/mcp-session-registry"
import {
  cursorProviderLayer,
  resolveCursorExecutable,
  type CursorAdapterOptions,
} from "@noyau/server/provider/cursor-acp"
import {
  ProviderPort,
  type ProviderSignal,
  type ProviderTurnInput,
} from "@noyau/server/provider/provider-port"
import { Clock, Deferred, Effect, Fiber, FileSystem, Layer, Option, Path, Schema } from "effect"
import { TestClock } from "effect/testing"

const platformLayer = Layer.mergeAll(NodeFileSystem.layer, Path.layer)
const fakeAgent = fileURLToPath(new URL("./fixtures/fake-cursor-acp.mjs", import.meta.url))
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

const recordingMcpSessions = (touchAlive = true) => {
  const issued: Array<string> = []
  const activated: Array<TurnId> = []
  const revoked: Array<string> = []
  let nextToken = 0
  let alive = touchAlive
  return {
    issued,
    activated,
    revoked,
    setTouchAlive: (value: boolean) => {
      alive = value
    },
    layer: Layer.succeed(McpSessionRegistry)({
      issue: () =>
        Effect.sync(() => {
          nextToken += 1
          const token = `Bearer test-mcp-token-${nextToken}`
          issued.push(token)
          return {
            config: {
              endpoint: "http://127.0.0.1:43123/mcp",
              authorizationHeader: token,
            },
          }
        }),
      resolve: () => Effect.succeed(missingMcpScope),
      activateTurn: (_threadId, activeTurnId) =>
        Effect.sync(() => {
          activated.push(activeTurnId)
        }),
      deactivateTurn: () => Effect.void,
      touchSession: () => Effect.sync(() => alive),
      revokeSession: () =>
        Effect.sync(() => {
          revoked.push(threadId)
        }),
      revokeAll: Effect.void,
    }),
  }
}

const input = (
  runtimeMode: ProviderTurnInput["runtimeMode"] = "full-access",
  resumeCursor: ProviderTurnInput["resumeCursor"] = null,
  modelSelection: ProviderTurnInput["modelSelection"] = null,
): ProviderTurnInput => ({
  projectId,
  threadId,
  turnId,
  provider: ProviderInstanceId.make("cursor"),
  text: "Implement the adapter",
  workspaceRoot: process.cwd(),
  runtimeMode,
  modelSelection,
  resumeCursor,
})

const makeOptions = Effect.fn("CursorAdapterTest.makeOptions")(function* (
  scenario: string,
  extras: {
    readonly sessionLoadReplayIdleGap?: CursorAdapterOptions["sessionLoadReplayIdleGap"] | undefined
    readonly sessionLoadTimeout?: CursorAdapterOptions["sessionLoadTimeout"] | undefined
  } = {},
) {
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
      ...extras,
    },
  } as const
})

const withProvider = <A, E, R>(
  scenario: string,
  use: (
    provider: ProviderPort["Service"],
    evidence: { readonly requestLog: string; readonly exitLog: string },
  ) => Effect.Effect<A, E, R>,
  extras: {
    readonly mcp?: Layer.Layer<McpSessionRegistry>
    readonly sessionLoadReplayIdleGap?: CursorAdapterOptions["sessionLoadReplayIdleGap"]
    readonly sessionLoadTimeout?: CursorAdapterOptions["sessionLoadTimeout"]
  } = {},
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const evidence = yield* makeOptions(scenario, {
        sessionLoadReplayIdleGap: extras.sessionLoadReplayIdleGap,
        sessionLoadTimeout: extras.sessionLoadTimeout,
      })
      const services = yield* Layer.build(
        cursorProviderLayer(evidence.options).pipe(
          Layer.provide(extras.mcp ?? testMcpSessionsLayer),
        ),
      )
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

const LoggedRequest = Schema.Struct({
  method: Schema.optionalKey(Schema.String),
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

const requestMethods = (log: string, method: string) =>
  parseRequests(log).filter((message) => message.method === method)

const resumeFrom = (signals: ReadonlyArray<ProviderSignal>) => {
  const session = signals.findLast((signal) => signal._tag === "session")
  return session?._tag === "session" ? session.resumeCursor : null
}

const waitForLog = Effect.fn("CursorAdapterTest.waitForLog")((filePath: string, snippet: string) =>
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

layer(platformLayer)("Cursor ACP adapter", (it) => {
  it.effect("prefers an explicit configured path, then PATH, then a bare fallback", () =>
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
        configured,
      )
      assert.strictEqual(
        yield* resolveCursorExecutable("cursor-agent", { PATH: directory }, "linux"),
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
              assert.deepStrictEqual(status[ProviderInstanceId.make("cursor")], {
                instanceId: ProviderInstanceId.make("cursor"),
                driver: ProviderDriverKind.make("cursor"),
                enabled: true,
                installed: true,
                handshakeOk: true,
                version: null,
                plan: null,
                binaryPath: process.execPath,
                models: [
                  {
                    modelId: "composer-2.5",
                    label: "Composer 2.5",
                    reasoningEfforts: [
                      { value: "low", label: "Low" },
                      { value: "medium", label: "Medium", isDefault: true },
                      { value: "high", label: "High" },
                    ],
                    serviceTiers: [
                      { value: "normal", label: "Normal", isDefault: true },
                      {
                        value: "fast",
                        label: "Fast",
                        description: "1.5x speed, increased usage",
                      },
                    ],
                  },
                  {
                    modelId: "composer-2.5-fast",
                    label: "Composer 2.5 Fast",
                    reasoningEfforts: [
                      { value: "low", label: "Low" },
                      { value: "medium", label: "Medium", isDefault: true },
                      { value: "high", label: "High" },
                    ],
                    serviceTiers: [
                      { value: "normal", label: "Normal", isDefault: true },
                      {
                        value: "fast",
                        label: "Fast",
                        description: "1.5x speed, increased usage",
                      },
                    ],
                  },
                ],
              })
            }),
          ),
        ),
      )
      yield* withProvider("missing-load", (provider) =>
        provider.status.pipe(
          Effect.tap((status) =>
            Effect.sync(() => {
              assert.deepStrictEqual(status[ProviderInstanceId.make("cursor")], {
                instanceId: ProviderInstanceId.make("cursor"),
                driver: ProviderDriverKind.make("cursor"),
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
      yield* withProvider("missing-mcp-http", (provider) =>
        provider.status.pipe(
          Effect.tap((status) =>
            Effect.sync(() => {
              assert.deepStrictEqual(status[ProviderInstanceId.make("cursor")], {
                instanceId: ProviderInstanceId.make("cursor"),
                driver: ProviderDriverKind.make("cursor"),
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
      yield* withProvider("wrong-version", (provider) =>
        provider.status.pipe(
          Effect.tap((status) =>
            Effect.sync(() => {
              assert.deepStrictEqual(status[ProviderInstanceId.make("cursor")], {
                instanceId: ProviderInstanceId.make("cursor"),
                driver: ProviderDriverKind.make("cursor"),
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
      yield* withProvider("auth-fail", (provider) =>
        provider.status.pipe(
          Effect.tap((status) =>
            Effect.sync(() => {
              assert.deepStrictEqual(status[ProviderInstanceId.make("cursor")], {
                instanceId: ProviderInstanceId.make("cursor"),
                driver: ProviderDriverKind.make("cursor"),
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

  it.effect("maps new, live updates, and end_turn to Noyau signals", () =>
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
        assert.deepStrictEqual(assistantTexts, ["hello from fake Cursor"])
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
        assert.isTrue(
          signals.some(
            (signal) =>
              signal._tag === "transcript" &&
              signal.item._tag === "transcript.tool" &&
              signal.item.status === "completed" &&
              signal.item.name === "Read file" &&
              signal.item.action === "read" &&
              signal.item.outputSummary === "src/pages/mentions-legales.astro",
          ),
        )
        assert.isFalse(
          signals.some(
            (signal) =>
              signal._tag === "transcript" &&
              signal.item._tag === "transcript.tool" &&
              (signal.item.name === "Cursor tool" ||
                signal.item.outputSummary?.includes("PageHero") === true ||
                signal.item.outputSummary?.includes("{") === true),
          ),
        )
        assert.isTrue(
          signals.some((signal) => signal._tag === "turn-ended" && signal.state === "completed"),
        )
        const requests = (yield* readLog(evidence.requestLog))
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
        const created = requests.find((message) => message.method === "session/new")
        assert.deepInclude(created?.params, {
          mcpServers: [
            {
              type: "http",
              name: "noyau",
              url: "http://127.0.0.1:43123/mcp",
              headers: [{ name: "Authorization", value: "Bearer test-mcp-token" }],
            },
          ],
        })
      }),
    ),
  )

  it.effect("keeps the Turn alive while a batched Cursor question waits", () =>
    withProvider("pending-user-input-settlement", (provider) =>
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
        yield* Deferred.await(pendingVisible)
        assert.isFalse(signals.some((signal) => signal._tag === "turn-ended"))

        yield* provider.respondUserInput(
          threadId,
          ApprovalRequestId.make("cursor-question-batch"),
          {
            runtime: { optionIds: ["bun"] },
            surfaces: { optionIds: ["web", "desktop"] },
          },
        )
        yield* provider.drain

        const resolvedIndex = signals.findIndex(
          (signal) =>
            signal._tag === "transcript" &&
            signal.item._tag === "transcript.user-input" &&
            signal.item.status === "resolved",
        )
        const endedIndex = signals.findIndex((signal) => signal._tag === "turn-ended")
        assert.isTrue(resolvedIndex !== -1 && endedIndex > resolvedIndex)
      }),
    ),
  )

  it.effect("interrupts a Turn that is settling on a pending Cursor question", () =>
    withProvider("pending-user-input-settlement", (provider) =>
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
        yield* Deferred.await(pendingVisible)

        yield* provider.interrupt(threadId)
        yield* provider.drain

        const cancelledIndex = signals.findIndex((signal) => signal._tag === "user-input-cancelled")
        const endedIndex = signals.findIndex((signal) => signal._tag === "turn-ended")
        assert.isTrue(cancelledIndex !== -1 && endedIndex > cancelledIndex)
        assert.strictEqual(
          signals.find((signal) => signal._tag === "turn-ended")?.state,
          "interrupted",
        )
      }),
    ),
  )

  it.effect("detaches a pending Cursor question during graceful provider shutdown", () =>
    withProvider("pending-user-input-settlement", (provider) =>
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
        yield* Deferred.await(pendingVisible)

        yield* provider.stopAll
        yield* provider.drain

        assert.isTrue(signals.some((signal) => signal._tag === "user-input-detached"))
        assert.isFalse(
          signals.some(
            (signal) =>
              signal._tag === "transcript" &&
              signal.item._tag === "transcript.user-input" &&
              signal.item.status === "resolved",
          ),
        )
      }),
    ),
  )

  it.effect("keeps one ACP subprocess across Turns and closes it on session stop", () =>
    withProvider("success", (provider, evidence) =>
      Effect.gen(function* () {
        const first = yield* capture(provider, input())
        const second = yield* capture(provider, {
          ...input(),
          turnId: secondTurnId,
          text: "Continue the adapter",
        })

        const requests = (yield* readLog(evidence.requestLog))
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
        assert.strictEqual(requests.filter((message) => message.method === "initialize").length, 2)
        assert.strictEqual(
          requests.filter((message) => message.method === "authenticate").length,
          2,
        )
        assert.strictEqual(requests.filter((message) => message.method === "session/new").length, 1)
        assert.strictEqual(
          requests.filter((message) => message.method === "session/prompt").length,
          2,
        )
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

  it.effect("queues a Turn requested before the previous Turn finalizer completes", () =>
    withProvider("success", (provider, evidence) =>
      Effect.gen(function* () {
        const firstSignals: Array<ProviderSignal> = []
        const secondSignals: Array<ProviderSignal> = []
        let secondRequested = false
        const secondInput = { ...input(), turnId: secondTurnId, text: "Continue the adapter" }
        const onSecondSignal = (signal: ProviderSignal) =>
          Effect.sync(() => {
            secondSignals.push(signal)
          })
        const onFirstSignal = (signal: ProviderSignal) =>
          Effect.sync(() => {
            firstSignals.push(signal)
          }).pipe(
            Effect.andThen(
              signal._tag === "turn-ended" && !secondRequested
                ? Effect.sync(() => {
                    secondRequested = true
                  }).pipe(Effect.andThen(provider.startTurn(secondInput, onSecondSignal)))
                : Effect.void,
            ),
          )

        yield* provider.startTurn(input(), onFirstSignal)
        yield* provider.drain

        const requests = (yield* readLog(evidence.requestLog))
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
        assert.strictEqual(requests.filter((message) => message.method === "session/new").length, 1)
        assert.strictEqual(
          requests.filter((message) => message.method === "session/prompt").length,
          2,
        )
        assert.isTrue(
          firstSignals.some(
            (signal) => signal._tag === "turn-ended" && signal.state === "completed",
          ),
        )
        assert.isTrue(
          secondSignals.some(
            (signal) => signal._tag === "turn-ended" && signal.state === "completed",
          ),
        )
      }),
    ),
  )

  it.effect("updates the cached ACP mode when runtimeMode changes between Turns", () =>
    withProvider("success", (provider, evidence) =>
      Effect.gen(function* () {
        yield* capture(provider, input("full-access"))
        yield* capture(provider, { ...input("approval-required"), turnId: secondTurnId })
        yield* capture(provider, {
          ...input("full-access"),
          turnId: TurnId.make("30000000-0000-4000-8000-000000000003"),
        })

        const requests = (yield* readLog(evidence.requestLog))
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
          .filter(
            (message) =>
              message.method === "session/set_config_option" && message.params.configId === "mode",
          )
        assert.deepStrictEqual(
          requests.map((message) => message.params.value),
          ["ask", "agent"],
        )
      }),
    ),
  )

  it.effect("normalizes Cursor fast and thinking options without inventing an On/Off effort", () =>
    withProvider("model-traits", (provider) =>
      provider.status.pipe(
        Effect.tap((status) =>
          Effect.sync(() => {
            assert.deepStrictEqual(status[ProviderInstanceId.make("cursor")]?.models, [
              {
                modelId: "composer-2.5",
                label: "Composer 2.5",
                reasoningEfforts: [],
                serviceTiers: [
                  { value: "standard", label: "Standard", isDefault: true },
                  {
                    value: "fast",
                    label: "Fast",
                    description: "1.5x speed, increased usage",
                  },
                ],
              },
              {
                modelId: "claude-opus-5",
                label: "Claude Opus 5",
                reasoningEfforts: [],
                serviceTiers: [],
                thinking: { label: "Thinking", defaultValue: true },
              },
            ])
          }),
        ),
      ),
    ),
  )

  it.effect("applies the selected model, reasoning effort, and service tier before prompting", () =>
    withProvider("success", (provider, evidence) =>
      Effect.gen(function* () {
        yield* capture(
          provider,
          input("full-access", null, {
            modelId: "composer-2.5-fast",
            reasoningEffort: "high",
            serviceTier: "fast",
          }),
        )

        const log = (yield* readLog(evidence.requestLog))
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
        const requests = log.filter((message) => message.id !== undefined)
        const modelIndex = requests.findIndex(
          (message) =>
            message.method === "session/set_config_option" && message.params.configId === "model",
        )
        const effortIndex = requests.findIndex(
          (message) =>
            message.method === "session/set_config_option" && message.params.configId === "effort",
        )
        const tierIndex = requests.findIndex(
          (message) =>
            message.method === "session/set_config_option" &&
            message.params.configId === "service_tier",
        )
        const promptIndex = requests.findIndex((message) => message.method === "session/prompt")

        assert.isAtLeast(modelIndex, 0)
        assert.isAbove(effortIndex, modelIndex)
        assert.isAbove(tierIndex, effortIndex)
        assert.isAbove(promptIndex, tierIndex)
        assert.strictEqual(requests[modelIndex]?.params.value, "composer-2.5-fast")
        assert.strictEqual(requests[effortIndex]?.params.value, "high")
        assert.strictEqual(requests[tierIndex]?.params.value, "fast")
      }),
    ),
  )

  it.effect("envoie les images comme ContentBlock ACP", () =>
    withProvider("success", (provider, evidence) =>
      Effect.gen(function* () {
        const bytes = Uint8Array.of(1, 2, 3, 4)
        yield* capture(provider, {
          ...input(),
          attachments: [
            {
              type: "image",
              id: AttachmentId.make("70000000-0000-4000-8000-000000000001-0"),
              name: "shot.png",
              mimeType: "image/png",
              sizeBytes: bytes.byteLength,
              data: bytes,
            },
          ],
        })
        const log = (yield* readLog(evidence.requestLog))
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
        const prompt = log.find((message) => message.method === "session/prompt")
        assert.deepStrictEqual(prompt?.params?.prompt, [
          { type: "text", text: "Implement the adapter" },
          { type: "image", data: Buffer.from(bytes).toString("base64"), mimeType: "image/png" },
        ])
      }),
    ),
  )

  it.effect("applies normalized fast selections as ACP booleans", () =>
    withProvider("model-traits", (provider, evidence) =>
      Effect.gen(function* () {
        yield* capture(
          provider,
          input("full-access", null, {
            modelId: "composer-2.5",
            serviceTier: "fast",
          }),
        )

        const requests = (yield* readLog(evidence.requestLog))
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
          .filter((message) => message.method === "session/set_config_option")

        const fastRequest = requests.find((message) => message.params.configId === "fast")
        assert.deepInclude(fastRequest?.params, {
          configId: "fast",
          type: "boolean",
          value: true,
        })
      }),
    ),
  )

  it.effect("applies Cursor thinking selections with the advertised ACP value type", () =>
    withProvider("model-traits", (provider, evidence) =>
      Effect.gen(function* () {
        yield* capture(
          provider,
          input("full-access", null, {
            modelId: "claude-opus-5",
            thinking: false,
          }),
        )

        const requests = (yield* readLog(evidence.requestLog))
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
          .filter((message) => message.method === "session/set_config_option")

        const thinkingRequest = requests.find((message) => message.params.configId === "thinking")
        assert.deepInclude(thinkingRequest?.params, {
          configId: "thinking",
          value: "false",
        })
      }),
    ),
  )

  it.effect("encodes @mentions as ACP resource_link blocks", () =>
    withProvider("success", (provider, evidence) =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const workspace = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-mention-" })
        yield* fileSystem.makeDirectory(path.join(workspace, "src"), { recursive: true })
        yield* fileSystem.writeFileString(path.join(workspace, "src/adapter.ts"), "export {}\n")

        yield* capture(provider, {
          ...input(),
          text: "Look at @src/adapter.ts please",
          workspaceRoot: workspace,
        })

        const requests = (yield* readLog(evidence.requestLog))
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
        const prompt = requests.find((message) => message.method === "session/prompt")?.params
          ?.prompt
        const fileUrl = yield* path.toFileUrl(path.join(workspace, "src/adapter.ts"))
        assert.deepStrictEqual(prompt, [
          { type: "text", text: "Look at " },
          { type: "resource_link", name: "adapter.ts", uri: fileUrl.href },
          { type: "text", text: " please" },
        ])
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
        const setupRequests = log
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
          .filter(
            (message) => message.method === "session/load" || message.method === "session/new",
          )
        assert.lengthOf(setupRequests, 2)
        for (const request of setupRequests) {
          assert.strictEqual(request.params.mcpServers[0]?.type, "http")
          assert.strictEqual(request.params.mcpServers[0]?.name, "noyau")
        }
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
        const usage = signals.find((signal) => signal._tag === "context-usage")
        assert.deepStrictEqual(
          usage?._tag === "context-usage" ? { used: usage.used, window: usage.window } : undefined,
          { used: 12400, window: 200000 },
        )
        const log = yield* readLog(evidence.requestLog)
        assert.include(log, '"method":"session/load"')
        assert.notInclude(log, '"method":"session/new"')
        const loaded = log
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
          .find((message) => message.method === "session/load")
        assert.strictEqual(loaded?.params.mcpServers[0]?.type, "http")
        assert.strictEqual(loaded?.params.mcpServers[0]?.name, "noyau")
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
    withProvider("cancel", (provider, evidence) =>
      Effect.gen(function* () {
        const signals: Array<ProviderSignal> = []
        yield* provider.startTurn(input(), (signal) =>
          Effect.sync(() => {
            signals.push(signal)
          }),
        )
        yield* waitForLog(evidence.requestLog, '"method":"session/prompt"')
        yield* provider.interrupt(threadId)
        yield* provider.drain
        assert.isTrue(
          signals.some((signal) => signal._tag === "turn-ended" && signal.state === "interrupted"),
        )
      }),
    ),
  )

  it.effect("kills the exact child after a silent cancel exceeds two seconds", () =>
    withProvider("ignore-cancel", (provider, evidence) =>
      Effect.gen(function* () {
        const signals: Array<ProviderSignal> = []
        yield* provider.startTurn(input(), (signal) =>
          Effect.sync(() => {
            signals.push(signal)
          }),
        )
        yield* waitForLog(evidence.requestLog, '"method":"session/prompt"')
        const interrupt = yield* provider.interrupt(threadId).pipe(Effect.forkChild)
        yield* TestClock.adjust("2 seconds")
        yield* Fiber.join(interrupt)
        yield* provider.drain
        assert.isTrue(
          signals.some((signal) => signal._tag === "turn-ended" && signal.state === "interrupted"),
        )
        assert.isFalse(
          signals.some((signal) => signal._tag === "session" && signal.status === "error"),
        )
      }),
    ),
  )

  it.effect("loads the persisted session after an idle reap", () =>
    withProvider("success", (provider, evidence) =>
      Effect.gen(function* () {
        const first = yield* capture(provider, input())
        const resumeCursor = resumeFrom(first)
        assert.isNotNull(resumeCursor)
        assert.isTrue(yield* provider.reapIdle(threadId))
        const second = yield* capture(provider, {
          ...input(),
          turnId: secondTurnId,
          resumeCursor,
        })
        const log = yield* readLog(evidence.requestLog)
        assert.strictEqual(requestMethods(log, "session/new").length, 1)
        assert.strictEqual(requestMethods(log, "session/load").length, 1)
        assert.strictEqual(requestMethods(log, "session/prompt").length, 2)
        assert.isFalse(
          second.some(
            (signal) =>
              signal._tag === "transcript" &&
              signal.item._tag === "transcript.assistant" &&
              signal.item.text.includes("replay"),
          ),
        )
      }),
    ),
  )

  it.effect("loads the persisted session after an explicit stop", () =>
    withProvider("success", (provider, evidence) =>
      Effect.gen(function* () {
        const first = yield* capture(provider, input())
        const resumeCursor = resumeFrom(first)
        yield* provider.stop(threadId)
        yield* capture(provider, { ...input(), turnId: secondTurnId, resumeCursor })
        const log = yield* readLog(evidence.requestLog)
        assert.strictEqual(requestMethods(log, "session/new").length, 1)
        assert.strictEqual(requestMethods(log, "session/load").length, 1)
      }),
    ),
  )

  it.effect("loads the persisted session after a mid-prompt rupture", () =>
    withProvider("rupture", (provider, evidence) =>
      Effect.gen(function* () {
        const first = yield* capture(provider, input())
        const resumeCursor = resumeFrom(first)
        assert.isNotNull(resumeCursor)
        yield* capture(provider, { ...input(), turnId: secondTurnId, resumeCursor })
        const log = yield* readLog(evidence.requestLog)
        assert.strictEqual(requestMethods(log, "session/new").length, 1)
        assert.strictEqual(requestMethods(log, "session/load").length, 1)
      }),
    ),
  )

  it.effect("issues one MCP credential per spawn and revokes it on stop", () => {
    const mcp = recordingMcpSessions()
    return withProvider(
      "success",
      (provider, evidence) =>
        Effect.gen(function* () {
          yield* capture(provider, input())
          yield* capture(provider, { ...input(), turnId: secondTurnId })
          assert.deepStrictEqual(mcp.issued, ["Bearer test-mcp-token-1"])
          assert.deepStrictEqual(mcp.revoked, [])
          const firstPrompt = (yield* readLog(evidence.requestLog))
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line))
            .find((message) => message.method === "session/new")
          assert.strictEqual(
            firstPrompt?.params.mcpServers[0]?.headers[0]?.value,
            "Bearer test-mcp-token-1",
          )
          yield* provider.stop(threadId)
          assert.deepStrictEqual(mcp.revoked, [threadId])
        }),
      { mcp: mcp.layer },
    )
  })

  it.effect("respawns with a new bearer when touchSession reports the credential dead", () => {
    const mcp = recordingMcpSessions()
    return withProvider(
      "success",
      (provider, evidence) =>
        Effect.gen(function* () {
          const first = yield* capture(provider, input())
          mcp.setTouchAlive(false)
          yield* capture(provider, {
            ...input(),
            turnId: secondTurnId,
            resumeCursor: resumeFrom(first),
          })
          const log = yield* readLog(evidence.requestLog)
          assert.strictEqual(requestMethods(log, "session/new").length, 1)
          assert.strictEqual(requestMethods(log, "session/load").length, 1)
          assert.deepStrictEqual(mcp.issued, ["Bearer test-mcp-token-1", "Bearer test-mcp-token-2"])
          assert.deepStrictEqual(mcp.revoked, [threadId])
        }),
      { mcp: mcp.layer },
    )
  })

  it.effect("treats a hung session/load as ready after replay goes idle", () =>
    withProvider(
      "hang-load",
      (provider, evidence) =>
        Effect.gen(function* () {
          const signals: Array<ProviderSignal> = []
          yield* provider.startTurn(
            input("full-access", {
              schemaVersion: 1,
              sessionId: ProviderSessionId.make("persisted-session"),
            }),
            (signal) =>
              Effect.sync(() => {
                signals.push(signal)
              }),
          )
          yield* waitForLog(evidence.requestLog, '"method":"session/load"')
          yield* TestClock.withLive(Effect.sleep("50 millis"))
          yield* TestClock.adjust("2 seconds")
          yield* provider.drain
          const log = yield* readLog(evidence.requestLog)
          assert.strictEqual(requestMethods(log, "session/load").length, 1)
          assert.strictEqual(requestMethods(log, "session/new").length, 0)
          assert.strictEqual(requestMethods(log, "session/prompt").length, 1)
          assert.isFalse(
            signals.some(
              (signal) =>
                signal._tag === "transcript" &&
                signal.item._tag === "transcript.assistant" &&
                signal.item.text.includes("replay"),
            ),
          )
        }),
      { sessionLoadReplayIdleGap: "50 millis", sessionLoadTimeout: "5 seconds" },
    ),
  )

  it.effect("falls back to session/new when session/load stays pending without replay", () =>
    withProvider(
      "hang-load-silent",
      (provider, evidence) =>
        Effect.gen(function* () {
          yield* provider.startTurn(
            input("full-access", {
              schemaVersion: 1,
              sessionId: ProviderSessionId.make("persisted-session"),
            }),
            () => Effect.void,
          )
          yield* waitForLog(evidence.requestLog, '"method":"session/load"')
          yield* TestClock.adjust("90 seconds")
          yield* provider.drain
          const log = yield* readLog(evidence.requestLog)
          const methods = parseRequests(log).map((message) => message.method)
          assert.include(methods, "session/load")
          assert.include(methods, "session/new")
          assert.isAbove(methods.lastIndexOf("session/new"), methods.indexOf("session/load"))
        }),
      { sessionLoadReplayIdleGap: "2 seconds", sessionLoadTimeout: "90 seconds" },
    ),
  )

  it.effect("activates MCP before Cursor discovers servers during Session setup", () => {
    const mcp = recordingMcpSessions()
    return withProvider(
      "hang-new",
      (provider, evidence) =>
        Effect.gen(function* () {
          yield* provider.startTurn(input(), () => Effect.void)
          yield* waitForLog(evidence.requestLog, '"method":"session/new"')
          assert.deepStrictEqual(mcp.activated, [turnId])
          const stop = yield* provider.stop(threadId).pipe(Effect.forkChild)
          yield* TestClock.adjust("2 seconds")
          yield* Fiber.join(stop)
          yield* provider.drain
          const exits = yield* readLog(evidence.exitLog).pipe(Effect.orElseSucceed(() => ""))
          assert.isTrue(
            exits.includes("SIGTERM") || exits.includes("SIGKILL") || exits.includes("exit"),
          )
        }),
      { mcp: mcp.layer },
    )
  })

  it.effect("does not reap a Session that has an in-flight Turn", () =>
    withProvider("cancel", (provider, evidence) =>
      Effect.gen(function* () {
        yield* provider.startTurn(input(), () => Effect.void)
        yield* waitForLog(evidence.requestLog, '"method":"session/prompt"')
        assert.isFalse(yield* provider.reapIdle(threadId))
        yield* provider.interrupt(threadId)
        yield* provider.drain
        assert.isTrue(yield* provider.reapIdle(threadId))
      }),
    ),
  )
})
