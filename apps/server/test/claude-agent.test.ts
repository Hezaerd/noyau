import type {
  Options as ClaudeQueryOptions,
  SDKMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, layer } from "@effect/vitest"
import { ProviderInstanceId } from "@noyau/contracts/entities/environment"
import {
  ApprovalRequestId,
  AttachmentId,
  ProjectId,
  ProviderSessionId,
  ThreadId,
  TurnId,
} from "@noyau/contracts/ids"
import type { McpInvocationScope } from "@noyau/server/mcp/mcp-invocation-context"
import { McpSessionRegistry } from "@noyau/server/mcp/mcp-session-registry"
import {
  claudeModelsForVersion,
  claudeProviderLayer,
  resolveClaudeExecutable,
  type ClaudeAdapterOptions,
  type ClaudeQueryRuntime,
} from "@noyau/server/provider/claude-agent"
import {
  ProviderPort,
  type ProviderForkInput,
  type ProviderSignal,
  type ProviderTurnInput,
} from "@noyau/server/provider/provider-port"
import { Clock, Deferred, Effect, FileSystem, Layer, Path } from "effect"
import { TestClock } from "effect/testing"

const platformLayer = Layer.mergeAll(NodeFileSystem.layer, Path.layer)
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
const testMcpSessionsLayer = (onRevoke: () => void = () => undefined) =>
  Layer.succeed(McpSessionRegistry)({
    issue: () => Effect.succeed(staticMcpCredential),
    resolve: () => Effect.succeed(missingMcpScope),
    activateTurn: () => Effect.void,
    deactivateTurn: () => Effect.void,
    touchSession: () => Effect.succeed(true),
    revokeSession: () => Effect.sync(onRevoke),
    revokeAll: Effect.void,
  })

class FakeClaudeQuery implements ClaudeQueryRuntime {
  private readonly queue: Array<SDKMessage> = []
  private readonly waiters: Array<Deferred.Deferred<IteratorResult<SDKMessage>>> = []
  private done = false
  public readonly interruptCalls: Array<void> = []
  public closeCalls = 0

  emit(message: SDKMessage): void {
    if (this.done) {
      return
    }
    const waiter = this.waiters.shift()
    if (waiter) {
      Deferred.doneUnsafe(waiter, Effect.succeed({ done: false, value: message }))
      return
    }
    this.queue.push(message)
  }

  finish(): void {
    if (this.done) {
      return
    }
    this.done = true
    for (const waiter of this.waiters.splice(0)) {
      Deferred.doneUnsafe(waiter, Effect.succeed({ done: true, value: undefined }))
    }
  }

  readonly interrupt = (): Promise<void> => {
    this.interruptCalls.push(undefined)
    return Promise.resolve()
  }

  readonly close = (): void => {
    this.closeCalls += 1
    this.finish()
  };

  [Symbol.asyncIterator](): AsyncIterator<SDKMessage> {
    return {
      next: () => {
        if (this.queue.length > 0) {
          const value = this.queue.shift()
          if (value) {
            return Promise.resolve({ done: false, value })
          }
        }
        if (this.done) {
          return Promise.resolve({ done: true, value: undefined })
        }
        const deferred = Deferred.makeUnsafe<IteratorResult<SDKMessage>>()
        this.waiters.push(deferred)
        return Effect.runPromise(Deferred.await(deferred))
      },
    }
  }
}

const input = (extras: Partial<ProviderTurnInput> = {}): ProviderTurnInput => ({
  projectId,
  threadId,
  turnId,
  provider: ProviderInstanceId.make("claude"),
  text: "Implement the adapter",
  workspaceRoot: process.cwd(),
  runtimeMode: "full-access",
  modelSelection: null,
  resumeCursor: null,
  ...extras,
})

const assistantMessage = (
  text: string,
  sessionId = "11111111-1111-4111-8111-111111111111",
  uuid = "40000000-0000-4000-8000-000000000001",
) =>
  // SAFETY: fixture partiel ; les extracteurs Schema ne lisent que type / session_id / content.
  ({
    type: "assistant",
    session_id: sessionId,
    uuid,
    message: {
      role: "assistant",
      content: [{ type: "text", text }],
    },
  }) as SDKMessage

const toolUseMessage = (
  id: string,
  name: string,
  sessionId = "11111111-1111-4111-8111-111111111111",
) =>
  // SAFETY: fixture partiel ; extractToolUses ne lit que type / id / name.
  ({
    type: "assistant",
    session_id: sessionId,
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id, name, input: {} }],
    },
  }) as SDKMessage

const resultMessage = (
  subtype: "success" | "error_during_execution" = "success",
  sessionId = "11111111-1111-4111-8111-111111111111",
) =>
  // SAFETY: fixture partiel ; extractResultMessage ne lit que subtype / is_error / result / errors.
  ({
    type: "result",
    subtype,
    session_id: sessionId,
    is_error: subtype !== "success",
    result: subtype === "success" ? "ok" : "failed",
    errors: subtype === "success" ? [] : ["interrupt"],
  }) as unknown as SDKMessage

const withProvider = <A, E, R>(
  use: (
    provider: ProviderPort["Service"],
    harness: {
      readonly queries: Array<FakeClaudeQuery>
      readonly lastOptions: () => ClaudeQueryOptions | undefined
      readonly lastPrompt: () => AsyncIterable<SDKUserMessage> | undefined
      readonly revoked: () => number
    },
  ) => Effect.Effect<A, E, R>,
  extras: {
    readonly handshakeOk?: boolean
    readonly createQuery?: ClaudeAdapterOptions["createQuery"]
    readonly forkSession?: ClaudeAdapterOptions["forkSession"]
  } = {},
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const queries: Array<FakeClaudeQuery> = []
      let lastOptions: ClaudeQueryOptions | undefined
      let lastPrompt: AsyncIterable<SDKUserMessage> | undefined
      let revoked = 0
      const baseOptions: ClaudeAdapterOptions = {
        binaryPath: "/usr/local/bin/claude",
        environment: { PATH: "" },
        createQuery:
          extras.createQuery ??
          ((created) => {
            lastOptions = created.options
            lastPrompt = created.prompt
            const fake = new FakeClaudeQuery()
            queries.push(fake)
            return fake
          }),
        probeStatus: {
          installed: true,
          handshakeOk: extras.handshakeOk ?? true,
          version: "2.1.245",
          plan: "Pro",
          binaryPath: "/usr/local/bin/claude",
        },
      }
      const options: ClaudeAdapterOptions =
        extras.forkSession === undefined
          ? baseOptions
          : { ...baseOptions, forkSession: extras.forkSession }
      const services = yield* Layer.build(
        claudeProviderLayer(options).pipe(
          Layer.provide(
            testMcpSessionsLayer(() => {
              revoked += 1
            }),
          ),
        ),
      )
      return yield* Effect.gen(function* () {
        const provider = yield* ProviderPort
        return yield* use(provider, {
          queries,
          lastOptions: () => lastOptions,
          lastPrompt: () => lastPrompt,
          revoked: () => revoked,
        })
      }).pipe(Effect.provide(services))
    }),
  )

const endedBeforeReady = (signals: ReadonlyArray<ProviderSignal>) => {
  const ended = signals.findLastIndex((signal) => signal._tag === "turn-ended")
  const ready = signals.findLastIndex(
    (signal) => signal._tag === "session" && signal.status === "ready",
  )
  return ended !== -1 && ready !== -1 && ended < ready
}

const waitForQuery = Effect.fn("ClaudeAdapterTest.waitForQuery")(
  (queries: Array<FakeClaudeQuery>, minimum = 1) =>
    TestClock.withLive(
      Effect.gen(function* () {
        const deadline = (yield* Clock.currentTimeMillis) + 2_000
        while ((yield* Clock.currentTimeMillis) < deadline) {
          if (queries.length >= minimum) {
            const query = queries[queries.length - 1]
            if (query !== undefined) {
              return query
            }
          }
          yield* Effect.sleep("10 millis")
        }
        return yield* Effect.die("Claude query was never created")
      }),
    ),
)

const capture = Effect.fn("ClaudeAdapterTest.capture")(function* (
  provider: ProviderPort["Service"],
  turnInput: ProviderTurnInput,
  queries: Array<FakeClaudeQuery>,
  emit: (query: FakeClaudeQuery) => void,
  minimumQueries = 1,
) {
  const signals: Array<ProviderSignal> = []
  yield* provider.startTurn(turnInput, (signal) =>
    Effect.sync(() => {
      signals.push(signal)
    }),
  )
  const query = yield* waitForQuery(queries, minimumQueries)
  emit(query)
  yield* provider.drain
  return signals
})

layer(platformLayer)("Claude Agent SDK adapter", (it) => {
  it("exposes the t3code Claude catalog and hides models the CLI cannot run", () => {
    assert.deepStrictEqual(
      claudeModelsForVersion(null).map((model) => model.modelId),
      [
        "claude-fable-5",
        "claude-opus-5",
        "claude-opus-4-8",
        "claude-opus-4-7",
        "claude-opus-4-6",
        "claude-opus-4-5",
        "claude-sonnet-5",
        "claude-sonnet-4-6",
        "claude-haiku-4-5",
      ],
    )
    const oldCli = claudeModelsForVersion("2.1.0").map((model) => model.modelId)
    assert.deepStrictEqual(oldCli, [
      "claude-opus-4-6",
      "claude-opus-4-5",
      "claude-sonnet-5",
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
    ])
    assert.deepStrictEqual(
      claudeModelsForVersion(null)
        .filter((model) => model.isLegacy)
        .map((model) => model.modelId),
      [
        "claude-opus-4-8",
        "claude-opus-4-7",
        "claude-opus-4-6",
        "claude-opus-4-5",
        "claude-sonnet-4-6",
        "claude-haiku-4-5",
      ],
    )
  })

  it.effect("prefers an explicit configured path, then PATH, then a bare fallback", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-claude-path-" })
      const pathExecutable = path.join(directory, "claude")
      const configured = path.join(directory, "configured-claude")
      yield* fileSystem.writeFileString(pathExecutable, "#!/bin/sh\nexit 0\n")
      yield* fileSystem.writeFileString(configured, "#!/bin/sh\nexit 0\n")
      yield* fileSystem.chmod(pathExecutable, 0o755)
      yield* fileSystem.chmod(configured, 0o755)

      assert.strictEqual(
        yield* resolveClaudeExecutable(configured, { PATH: directory }, "linux"),
        configured,
      )
      assert.strictEqual(
        yield* resolveClaudeExecutable("claude", { PATH: directory }, "linux"),
        pathExecutable,
      )
      assert.strictEqual(
        yield* resolveClaudeExecutable(configured, { PATH: "" }, "linux"),
        configured,
      )
    }),
  )

  it.effect("exposes probe status and the built-in Claude catalog", () =>
    withProvider((provider) =>
      provider.status.pipe(
        Effect.tap((status) =>
          Effect.sync(() => {
            const claude = status[ProviderInstanceId.make("claude")]
            assert.deepStrictEqual(Object.keys(status), ["claude"])
            assert.strictEqual(claude?.instanceId, "claude")
            assert.strictEqual(claude?.enabled, true)
            assert.strictEqual(claude?.installed, true)
            assert.strictEqual(claude?.handshakeOk, true)
            assert.strictEqual(claude?.version, "2.1.245")
            assert.strictEqual(claude?.plan, "Pro")
            assert.deepStrictEqual(
              claude?.models?.map((model) => model.modelId),
              [
                "claude-fable-5",
                "claude-opus-5",
                "claude-opus-4-8",
                "claude-opus-4-7",
                "claude-opus-4-6",
                "claude-opus-4-5",
                "claude-sonnet-5",
                "claude-sonnet-4-6",
                "claude-haiku-4-5",
              ],
            )
          }),
        ),
      ),
    ),
  )

  it.effect("maps assistant text, tools, images, MCP, and turn completion", () =>
    withProvider((provider, harness) =>
      Effect.gen(function* () {
        const signals = yield* capture(
          provider,
          input({
            attachments: [
              {
                type: "image",
                id: AttachmentId.make("30000000-0000-4000-8000-000000000001-0"),
                name: "shot.png",
                mimeType: "image/png",
                sizeBytes: 4,
                data: new Uint8Array([1, 2, 3, 4]),
              },
            ],
          }),
          harness.queries,
          (query) => {
            query.emit(toolUseMessage("tool-1", "Bash"))
            query.emit(assistantMessage("hello from fake Claude"))
            query.emit(resultMessage())
            query.finish()
          },
        )
        const assistantTexts = signals.flatMap((signal) =>
          signal._tag === "transcript" && signal.item._tag === "transcript.assistant"
            ? [signal.item.text]
            : [],
        )
        assert.deepStrictEqual(assistantTexts, ["hello from fake Claude"])
        assert.isTrue(
          signals.some(
            (signal) =>
              signal._tag === "transcript" &&
              signal.item._tag === "transcript.tool" &&
              signal.item.name === "Bash" &&
              signal.item.action === "command",
          ),
        )
        assert.isTrue(
          signals.some((signal) => signal._tag === "turn-ended" && signal.state === "completed"),
        )
        assert.deepStrictEqual(
          signals.find((signal) => signal._tag === "turn-ended" && signal.state === "completed"),
          {
            _tag: "turn-ended",
            threadId,
            turnId,
            state: "completed",
            forkPoint: {
              schemaVersion: 1,
              boundaryId: "40000000-0000-4000-8000-000000000001",
            },
          },
        )
        const options = harness.lastOptions()
        assert.strictEqual(options?.mcpServers?.noyau?.type, "http")
        if (options?.mcpServers?.noyau?.type === "http") {
          assert.strictEqual(options.mcpServers.noyau.url, "http://127.0.0.1:43123/mcp")
          assert.strictEqual(
            options.mcpServers.noyau.headers?.Authorization,
            "Bearer test-mcp-token",
          )
        }
        const prompt = harness.lastPrompt()
        assert.isDefined(prompt)
        const first = yield* Effect.promise(() => prompt[Symbol.asyncIterator]().next())
        assert.isFalse(first.done)
        const content = first.value.message.content
        assert.isTrue(
          Array.isArray(content) &&
            content.some((block) => "type" in block && block.type === "image"),
        )
      }),
    ),
  )

  it.effect("forks Claude's persisted session at the selected assistant UUID", () => {
    const calls: Array<{
      readonly sessionId: string
      readonly options: { readonly dir?: string; readonly upToMessageId?: string } | undefined
    }> = []
    const forkInput: ProviderForkInput = {
      projectId,
      threadId: ThreadId.make("20000000-0000-4000-8000-000000000002"),
      sourceThreadId: threadId,
      sourceTurnId: turnId,
      provider: ProviderInstanceId.make("claude"),
      workspaceRoot: "/workspace/source",
      sourceResumeCursor: {
        schemaVersion: 1,
        sessionId: ProviderSessionId.make("11111111-1111-4111-8111-111111111111"),
      },
      sourceForkPoint: {
        schemaVersion: 1,
        boundaryId: "40000000-0000-4000-8000-000000000001",
      },
    }
    return withProvider(
      (provider) =>
        Effect.gen(function* () {
          const fork = provider.fork
          if (fork === undefined) {
            return yield* Effect.die("Claude provider does not expose native forks")
          }
          const cursor = yield* fork(forkInput)
          assert.deepStrictEqual(calls, [
            {
              sessionId: "11111111-1111-4111-8111-111111111111",
              options: {
                dir: "/workspace/source",
                upToMessageId: "40000000-0000-4000-8000-000000000001",
              },
            },
          ])
          assert.deepStrictEqual(cursor, {
            schemaVersion: 1,
            sessionId: ProviderSessionId.make("55555555-0000-4000-8000-000000000001"),
          })
        }),
      {
        forkSession: (sessionId, options) => {
          calls.push({ sessionId, options })
          return Promise.resolve({ sessionId: "55555555-0000-4000-8000-000000000001" })
        },
      },
    )
  })

  it.effect("reuses one query session across Turns and resumes after stop", () =>
    withProvider((provider, harness) =>
      Effect.gen(function* () {
        const first = yield* capture(provider, input(), harness.queries, (query) => {
          query.emit(assistantMessage("one"))
          query.emit(resultMessage())
        })
        const second = yield* capture(
          provider,
          { ...input(), turnId: secondTurnId, text: "Continue" },
          harness.queries,
          (query) => {
            query.emit(assistantMessage("two"))
            query.emit(resultMessage())
            query.finish()
          },
        )
        assert.strictEqual(harness.queries.length, 1)
        assert.isTrue(
          first.some((signal) => signal._tag === "turn-ended" && signal.state === "completed"),
        )
        assert.isTrue(
          second.some((signal) => signal._tag === "turn-ended" && signal.state === "completed"),
        )
        assert.isTrue(endedBeforeReady(first))
        assert.isTrue(endedBeforeReady(second))
        const resume = first.findLast((signal) => signal._tag === "session")
        assert.strictEqual(
          resume?._tag === "session" ? resume.resumeCursor?.sessionId : undefined,
          "11111111-1111-4111-8111-111111111111",
        )
        yield* provider.stop(threadId)
        const third = yield* capture(
          provider,
          {
            ...input(),
            turnId: TurnId.make("30000000-0000-4000-8000-000000000003"),
            resumeCursor: {
              schemaVersion: 1,
              sessionId: ProviderSessionId.make("11111111-1111-4111-8111-111111111111"),
            },
          },
          harness.queries,
          (query) => {
            query.emit(assistantMessage("resumed"))
            query.emit(resultMessage())
            query.finish()
          },
        )
        assert.strictEqual(harness.queries.length, 2)
        assert.strictEqual(harness.lastOptions()?.resume, "11111111-1111-4111-8111-111111111111")
        assert.isTrue(
          third.some((signal) => signal._tag === "turn-ended" && signal.state === "completed"),
        )
      }),
    ),
  )

  it.effect("routes tool approvals through canUseTool", () =>
    withProvider((provider, harness) =>
      Effect.gen(function* () {
        const signals: Array<ProviderSignal> = []
        yield* provider.startTurn(input({ runtimeMode: "approval-required" }), (signal) =>
          Effect.sync(() => {
            signals.push(signal)
          }),
        )
        yield* waitForQuery(harness.queries)
        const canUseTool = harness.lastOptions()?.canUseTool
        assert.isDefined(canUseTool)
        const requestId = "tool-approval-1"
        const abortSignal = yield* Effect.abortSignal
        const pending = canUseTool(
          "Bash",
          { command: "ls" },
          {
            signal: abortSignal,
            toolUseID: requestId,
            requestId,
          },
        )
        yield* TestClock.withLive(
          Effect.gen(function* () {
            const deadline = (yield* Clock.currentTimeMillis) + 2_000
            while ((yield* Clock.currentTimeMillis) < deadline) {
              if (
                signals.some(
                  (signal) =>
                    signal._tag === "transcript" &&
                    signal.item._tag === "transcript.permission" &&
                    signal.item.status === "pending",
                )
              ) {
                return
              }
              yield* Effect.sleep("10 millis")
            }
          }),
        )
        yield* provider.respondApproval(threadId, ApprovalRequestId.make(requestId), "accept")
        const result = yield* Effect.promise(() => pending)
        assert.isNotNull(result)
        assert.strictEqual(result?.behavior, "allow")
        const query = harness.queries[0]
        assert.isDefined(query)
        query.emit(resultMessage())
        query.finish()
        yield* provider.drain
      }),
    ),
  )

  it.effect("interrupts the live query", () =>
    withProvider((provider, harness) =>
      Effect.gen(function* () {
        const signals: Array<ProviderSignal> = []
        yield* provider.startTurn(input({ runtimeMode: "approval-required" }), (signal) =>
          Effect.sync(() => {
            signals.push(signal)
          }),
        )
        const query = yield* waitForQuery(harness.queries)
        yield* provider.interrupt(threadId)
        query.emit(resultMessage("error_during_execution"))
        query.finish()
        yield* provider.drain
        assert.strictEqual(query.interruptCalls.length, 1)
        assert.isTrue(
          signals.some((signal) => signal._tag === "turn-ended" && signal.state === "interrupted"),
        )
      }),
    ),
  )

  it.effect("recreates the query when the model or runtime mode changes", () =>
    withProvider((provider, harness) =>
      Effect.gen(function* () {
        yield* capture(provider, input(), harness.queries, (query) => {
          query.emit(assistantMessage("one"))
          query.emit(resultMessage())
        })
        yield* capture(
          provider,
          {
            ...input(),
            turnId: secondTurnId,
            text: "Continue",
            modelSelection: { modelId: "claude-sonnet-5" },
          },
          harness.queries,
          (query) => {
            query.emit(assistantMessage("two"))
            query.emit(resultMessage())
            query.finish()
          },
          2,
        )
        assert.strictEqual(harness.queries.length, 2)
        assert.strictEqual(harness.lastOptions()?.model, "claude-sonnet-5")
        assert.strictEqual(harness.lastOptions()?.resume, "11111111-1111-4111-8111-111111111111")
      }),
    ),
  )

  it.effect("rejects a turn when handshake failed", () =>
    withProvider(
      (provider) =>
        Effect.gen(function* () {
          const signals: Array<ProviderSignal> = []
          yield* provider.startTurn(input(), (signal) =>
            Effect.sync(() => {
              signals.push(signal)
            }),
          )
          yield* provider.drain
          assert.isTrue(
            signals.some((signal) => signal._tag === "turn-ended" && signal.state === "error"),
          )
        }),
      { handshakeOk: false },
    ),
  )

  it.effect("revokes MCP when the query fails to start", () =>
    withProvider(
      (provider, harness) =>
        Effect.gen(function* () {
          yield* provider.startTurn(input(), () => Effect.void)
          yield* provider.drain
          assert.strictEqual(harness.queries.length, 0)
          assert.isTrue(harness.revoked() >= 1)
        }),
      {
        createQuery: () => {
          throw new Error("boom")
        },
      },
    ),
  )
})
