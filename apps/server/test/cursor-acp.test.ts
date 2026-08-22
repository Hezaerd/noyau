import { fileURLToPath } from "node:url"

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, layer } from "@effect/vitest"
import {
  ApprovalRequestId,
  ProjectId,
  AttachmentId,
  ProviderSessionId,
  ThreadId,
  TurnId,
} from "@noyau/protocol/ids"
import type { McpInvocationScope } from "@noyau/server/mcp/mcp-invocation-context"
import { McpSessionRegistry } from "@noyau/server/mcp/mcp-session-registry"
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
const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const turnId = TurnId.make("30000000-0000-4000-8000-000000000001")
const missingMcpScope: McpInvocationScope | undefined = undefined
const testMcpSessionsLayer = Layer.succeed(McpSessionRegistry)({
  issue: () =>
    Effect.succeed({
      config: {
        endpoint: "http://127.0.0.1:43123/mcp",
        authorizationHeader: "Bearer test-mcp-token",
      },
    }),
  resolve: () => Effect.succeed(missingMcpScope),
  revokeTurn: () => Effect.void,
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
  text: "Implement the adapter",
  workspaceRoot: process.cwd(),
  runtimeMode,
  modelSelection,
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
      const services = yield* Layer.build(
        cursorProviderLayer(evidence.options).pipe(Layer.provide(testMcpSessionsLayer)),
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
              assert.deepStrictEqual(status, {
                installed: true,
                handshakeOk: false,
                version: "2026.03.20-test",
                plan: "Pro",
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
              assert.deepStrictEqual(status, {
                installed: true,
                handshakeOk: false,
                version: "2026.03.20-test",
                plan: "Pro",
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
              assert.deepStrictEqual(status, {
                installed: true,
                handshakeOk: false,
                version: "2026.03.20-test",
                plan: "Pro",
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
              assert.deepStrictEqual(status, {
                installed: true,
                handshakeOk: false,
                version: "2026.03.20-test",
                plan: "Pro",
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

  it.effect("normalizes Cursor fast and thinking options without inventing an On/Off effort", () =>
    withProvider("model-traits", (provider) =>
      provider.status.pipe(
        Effect.tap((status) =>
          Effect.sync(() => {
            assert.deepStrictEqual(status.models, [
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
                thinking: { label: "Réflexion", defaultValue: true },
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
