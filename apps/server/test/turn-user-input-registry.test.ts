import { assert, describe, it } from "@effect/vitest"
import { ProviderInstanceId } from "@noyau/contracts/entities/environment"
import { ApprovalRequestId, ProjectId, ThreadId, TurnId } from "@noyau/contracts/ids"
import { ThreadTranscriptAppend } from "@noyau/contracts/thread/commands"
import { ThreadSessionSet, ThreadTurnEnded } from "@noyau/contracts/thread/events"
import { decide } from "@noyau/server/orchestration/thread/decider"
import { evolve, type ThreadState } from "@noyau/server/orchestration/thread/projector"
import type { ProviderSignal } from "@noyau/server/provider/provider-port"
import {
  makeTurnUserInputRegistry,
  type UserInputRequest,
} from "@noyau/server/provider/turn-user-input-registry"
import { Deferred, Effect, Fiber, Result, Schema } from "effect"

const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const turnId = TurnId.make("30000000-0000-4000-8000-000000000001")
const secondTurnId = TurnId.make("30000000-0000-4000-8000-000000000002")
const requestId = ApprovalRequestId.make("ask-batch")
const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const issuedAtString = "2026-09-02T12:00:00.000Z"
const issuedAt = Schema.decodeSync(Schema.DateTimeUtcFromString)(issuedAtString)
const decodeTranscriptAppend = Schema.decodeUnknownEffect(ThreadTranscriptAppend)

const request: UserInputRequest = {
  threadId,
  turnId,
  requestId,
  title: "Choose the direction",
  prompt: "Which runtime should we use?",
  questions: [
    {
      id: "runtime",
      prompt: "Which runtime should we use?",
      options: [
        { id: "bun", label: "Bun" },
        { id: "node", label: "Node" },
      ],
    },
    {
      id: "targets",
      prompt: "Which targets matter?",
      options: [
        { id: "web", label: "Web" },
        { id: "desktop", label: "Desktop" },
      ],
      allowMultiple: true,
    },
  ],
}

describe("TurnUserInputRegistry", () => {
  it.effect("resolves one provider callback for an entire question batch", () =>
    Effect.gen(function* () {
      const registry = yield* makeTurnUserInputRegistry
      const signals: Array<ProviderSignal> = []
      yield* registry.bindTurn(threadId, turnId, (signal) =>
        Effect.sync(() => {
          signals.push(signal)
        }),
      )

      const response = yield* registry.request(request).pipe(Effect.forkChild)
      yield* Effect.yieldNow

      assert.lengthOf(signals, 1)
      assert.strictEqual(signals[0]?._tag, "transcript")
      if (signals[0]?._tag !== "transcript") {
        return
      }
      assert.strictEqual(signals[0].item._tag, "transcript.user-input")
      if (signals[0].item._tag !== "transcript.user-input") {
        return
      }
      assert.strictEqual(signals[0].item.status, "pending")
      assert.lengthOf(signals[0].item.questions ?? [], 2)

      const answers = {
        runtime: { optionIds: ["bun"] },
        targets: { optionIds: ["web", "desktop"] },
      }
      yield* registry.resolve(threadId, requestId, answers)
      assert.deepStrictEqual(yield* Fiber.join(response), answers)

      assert.lengthOf(signals, 2)
      assert.strictEqual(signals[1]?._tag, "transcript")
      if (signals[1]?._tag !== "transcript") {
        return
      }
      assert.strictEqual(signals[1].item._tag, "transcript.user-input")
      if (signals[1].item._tag !== "transcript.user-input") {
        return
      }
      assert.strictEqual(signals[1].item.status, "resolved")
      assert.deepStrictEqual(signals[1].item.answers, answers)
    }),
  )

  it.effect("reserves one live response and detaches without returning empty answers", () =>
    Effect.gen(function* () {
      const registry = yield* makeTurnUserInputRegistry
      const signals: Array<ProviderSignal> = []
      const pendingVisible = yield* Deferred.make<void>()
      yield* registry.bindTurn(threadId, turnId, (signal) =>
        Effect.sync(() => {
          signals.push(signal)
        }).pipe(
          Effect.andThen(
            signal._tag === "transcript" &&
              signal.item._tag === "transcript.user-input" &&
              signal.item.status === "pending"
              ? Deferred.succeed(pendingVisible, undefined)
              : Effect.void,
          ),
        ),
      )

      const response = yield* registry.request(request).pipe(Effect.forkChild)
      yield* Deferred.await(pendingVisible)
      assert.isTrue(yield* registry.reserve(threadId, requestId))
      assert.isFalse(yield* registry.reserve(threadId, requestId))
      yield* registry.release(threadId, requestId)
      assert.isTrue(yield* registry.reserve(threadId, requestId))

      yield* registry.closeTurn(threadId, turnId, "detach")
      const closed = yield* Fiber.join(response).pipe(Effect.flip)
      assert.strictEqual(closed._tag, "UserInputRequestClosed")
      if (closed._tag !== "UserInputRequestClosed") {
        return
      }
      assert.strictEqual(closed.reason, "detached")
      assert.deepStrictEqual(
        signals.map((signal) => signal._tag),
        ["transcript", "user-input-detached"],
      )
    }),
  )

  it.effect("emits the resolved item before terminal state can reject it", () =>
    Effect.gen(function* () {
      const registry = yield* makeTurnUserInputRegistry
      const rejectionTags: Array<string> = []
      const pendingVisible = yield* Deferred.make<void>()
      let state: ThreadState = {
        availableProjectIds: [projectId],
        threads: [
          {
            threadId,
            projectId,
            title: "AskQuestion lifecycle",
            provider: ProviderInstanceId.make("codex"),
            runtimeMode: "full-access",
            modelSelection: null,
            branch: null,
            worktreePath: null,
            status: "active",
            session: {
              threadId,
              status: "running",
              lastError: null,
              activeTurnId: turnId,
              runtimeMode: "full-access",
              resumeCursor: null,
              updatedAt: issuedAt,
            },
            contextUsage: null,
            settledOverride: null,
            settledAt: null,
            turns: [{ turnId, ordinal: 1, state: "running" }],
            transcript: [],
            inheritedTranscript: [],
            forkOrigin: null,
          },
        ],
      }
      let commandOrdinal = 0
      yield* registry.bindTurn(threadId, turnId, (signal) =>
        Effect.gen(function* () {
          if (signal._tag !== "transcript") {
            return
          }
          commandOrdinal += 1
          const command = yield* decodeTranscriptAppend({
            _tag: "thread.transcript.append",
            commandId: `70000000-0000-4000-8000-${String(commandOrdinal).padStart(12, "0")}`,
            projectId,
            actorId: "system:cursor",
            correlationId: "80000000-0000-4000-8000-000000000001",
            issuedAt: issuedAtString,
            schemaVersion: 1,
            payload: { item: signal.item },
          }).pipe(Effect.orDie)
          yield* Effect.sync(() => {
            const decision = decide(state, command)
            if (Result.isFailure(decision)) {
              rejectionTags.push(decision.failure._tag)
              throw decision.failure
            }
            state = decision.success.reduce(evolve, state)
          })
          if (signal.item._tag === "transcript.user-input" && signal.item.status === "pending") {
            yield* Deferred.succeed(pendingVisible, undefined)
          }
        }),
      )

      const response = yield* registry.request(request).pipe(Effect.forkChild)
      yield* Deferred.await(pendingVisible)
      const settlement = yield* registry.closeTurn(threadId, turnId, "wait").pipe(
        Effect.andThen(
          Effect.sync(() => {
            state = evolve(state, ThreadTurnEnded.make({ threadId, turnId, state: "completed" }))
            state = evolve(
              state,
              ThreadSessionSet.make({
                threadId,
                session: {
                  threadId,
                  status: "ready",
                  lastError: null,
                  activeTurnId: null,
                  runtimeMode: "full-access",
                  resumeCursor: null,
                  updatedAt: issuedAt,
                },
              }),
            )
          }),
        ),
        Effect.forkChild,
      )
      yield* Effect.yieldNow

      assert.strictEqual(state.threads[0]?.turns[0]?.state, "running")
      const lateRequest = yield* Effect.flip(
        registry.request({
          ...request,
          requestId: ApprovalRequestId.make("late-question"),
        }),
      )
      assert.strictEqual(lateRequest._tag, "UserInputTurnInactive")
      yield* registry.resolve(threadId, requestId, {
        runtime: { optionIds: ["bun"] },
        targets: { optionIds: ["web", "desktop"] },
      })
      yield* Fiber.join(response)
      yield* Fiber.join(settlement)

      assert.deepStrictEqual(rejectionTags, [])
      assert.strictEqual(state.threads[0]?.turns[0]?.state, "completed")
      const userInput = state.threads[0]?.transcript.find(
        (item) => item._tag === "transcript.user-input",
      )
      assert.strictEqual(userInput?.status, "resolved")
    }),
  )

  it.effect("ignores a stale unbind from the preceding Turn", () =>
    Effect.gen(function* () {
      const registry = yield* makeTurnUserInputRegistry
      const signals: Array<ProviderSignal> = []
      const pendingVisible = yield* Deferred.make<void>()
      yield* registry.bindTurn(threadId, turnId, () => Effect.void)
      yield* registry.bindTurn(threadId, secondTurnId, (signal) => {
        const record = Effect.sync(() => {
          signals.push(signal)
        })
        return signal._tag === "transcript" &&
          signal.item._tag === "transcript.user-input" &&
          signal.item.status === "pending"
          ? record.pipe(Effect.andThen(Deferred.succeed(pendingVisible, undefined)))
          : record
      })
      yield* registry.unbindTurn(threadId, turnId)

      const nextRequestId = ApprovalRequestId.make("next-turn-question")
      const response = yield* registry
        .request({
          ...request,
          turnId: secondTurnId,
          requestId: nextRequestId,
        })
        .pipe(Effect.forkChild)
      yield* Deferred.await(pendingVisible)
      assert.strictEqual(signals[0]?._tag, "transcript")

      const answers = { runtime: { optionIds: ["node"] } }
      yield* registry.resolve(threadId, nextRequestId, answers)
      assert.deepStrictEqual(yield* Fiber.join(response), answers)
    }),
  )
})
