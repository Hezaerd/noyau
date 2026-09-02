import type {
  ProviderUserInputAnswers,
  UserInputQuestion,
} from "@noyau/contracts/entities/approvals"
import type { TranscriptUserInput } from "@noyau/contracts/entities/transcript"
import { ApprovalRequestId, type ThreadId, type TurnId } from "@noyau/contracts/ids"
import { Context, Deferred, Effect, Layer, Schema } from "effect"

import type { ProviderEmit } from "./provider-port.ts"

export class UserInputTurnInactive extends Schema.TaggedError<UserInputTurnInactive>()(
  "UserInputTurnInactive",
  { threadId: Schema.String },
) {}

export class UserInputRequestClosed extends Schema.TaggedError<UserInputRequestClosed>()(
  "UserInputRequestClosed",
  {
    threadId: Schema.String,
    requestId: Schema.String,
    reason: Schema.Literals(["detached", "cancelled"]),
  },
) {}

export type UserInputCloseMode = "wait" | "detach" | "cancel"

export interface UserInputRequest {
  readonly threadId: ThreadId
  readonly turnId: TurnId
  readonly requestId: ApprovalRequestId
  readonly title?: string | undefined
  readonly prompt?: string | undefined
  readonly questions?: ReadonlyArray<UserInputQuestion> | undefined
}

interface TurnBinding {
  readonly turnId: TurnId
  readonly emit: ProviderEmit
  accepting: boolean
  readonly pending: Map<
    string,
    {
      readonly answers: Deferred.Deferred<ProviderUserInputAnswers, UserInputRequestClosed>
      readonly completed: Deferred.Deferred<void>
      reserved: boolean
    }
  >
}

export interface TurnUserInputRegistryService {
  readonly bindTurn: (threadId: ThreadId, turnId: TurnId, emit: ProviderEmit) => Effect.Effect<void>
  readonly unbindTurn: (threadId: ThreadId, turnId: TurnId) => Effect.Effect<void>
  readonly request: (
    input: UserInputRequest,
  ) => Effect.Effect<ProviderUserInputAnswers, UserInputTurnInactive | UserInputRequestClosed>
  readonly resolve: (
    threadId: ThreadId,
    requestId: ApprovalRequestId,
    answers: ProviderUserInputAnswers,
  ) => Effect.Effect<boolean>
  readonly reserve: (threadId: ThreadId, requestId: ApprovalRequestId) => Effect.Effect<boolean>
  readonly release: (threadId: ThreadId, requestId: ApprovalRequestId) => Effect.Effect<void>
  readonly awaitTurnIdle: (threadId: ThreadId, turnId: TurnId) => Effect.Effect<void>
  readonly closeTurn: (
    threadId: ThreadId,
    turnId: TurnId,
    mode: UserInputCloseMode,
  ) => Effect.Effect<void>
}

export class TurnUserInputRegistry extends Context.Service<
  TurnUserInputRegistry,
  TurnUserInputRegistryService
>()("@noyau/server/provider/TurnUserInputRegistry") {}

const pendingKey = (requestId: ApprovalRequestId): string => requestId

export const makeTurnUserInputRegistry = Effect.sync(() => {
  const turns = new Map<string, TurnBinding>()

  const bindTurn: TurnUserInputRegistryService["bindTurn"] = (threadId, turnId, emit) =>
    Effect.sync(() => {
      turns.set(threadId, { turnId, emit, accepting: true, pending: new Map() })
    })

  const request: TurnUserInputRegistryService["request"] = Effect.fn(
    "TurnUserInputRegistry.request",
  )(function* (input) {
    const binding = turns.get(input.threadId)
    if (binding === undefined || binding.turnId !== input.turnId || !binding.accepting) {
      return yield* new UserInputTurnInactive({ threadId: input.threadId })
    }
    const key = pendingKey(input.requestId)
    const pending = {
      answers: Deferred.makeUnsafe<ProviderUserInputAnswers, UserInputRequestClosed>(),
      completed: Deferred.makeUnsafe<void>(),
      reserved: false,
    }
    binding.pending.set(key, pending)

    let pendingItem: TranscriptUserInput = {
      _tag: "transcript.user-input",
      threadId: input.threadId,
      turnId: input.turnId,
      requestId: input.requestId,
      status: "pending",
    }
    if (input.title !== undefined) {
      pendingItem = Object.assign(pendingItem, { title: input.title })
    }
    if (input.prompt !== undefined) {
      pendingItem = Object.assign(pendingItem, { prompt: input.prompt })
    }
    if (input.questions !== undefined && input.questions.length > 0) {
      pendingItem = Object.assign(pendingItem, { questions: [...input.questions] })
    }
    return yield* Effect.gen(function* () {
      yield* binding.emit({ _tag: "transcript", item: pendingItem })
      const answers = yield* Deferred.await(pending.answers)
      yield* binding.emit({
        _tag: "transcript",
        item: { ...pendingItem, status: "resolved", answers },
      })
      return answers
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (binding.pending.get(key) === pending) {
            binding.pending.delete(key)
          }
        }).pipe(Effect.andThen(Deferred.succeed(pending.completed, undefined))),
      ),
    )
  })

  const resolve: TurnUserInputRegistryService["resolve"] = (threadId, requestId, answers) =>
    Effect.gen(function* () {
      const pending = turns.get(threadId)?.pending.get(pendingKey(requestId))
      if (pending === undefined) {
        return false
      }
      yield* Deferred.succeed(pending.answers, answers)
      return true
    })

  const reserve: TurnUserInputRegistryService["reserve"] = (threadId, requestId) =>
    Effect.sync(() => {
      const pending = turns.get(threadId)?.pending.get(pendingKey(requestId))
      if (pending === undefined || pending.reserved) {
        return false
      }
      pending.reserved = true
      return true
    })

  const release: TurnUserInputRegistryService["release"] = (threadId, requestId) =>
    Effect.sync(() => {
      const pending = turns.get(threadId)?.pending.get(pendingKey(requestId))
      if (pending !== undefined) {
        pending.reserved = false
      }
    })

  const awaitTurnIdle: TurnUserInputRegistryService["awaitTurnIdle"] = Effect.fn(
    "TurnUserInputRegistry.awaitTurnIdle",
  )(function* (threadId, turnId) {
    while (true) {
      const binding = turns.get(threadId)
      const pending =
        binding === undefined || binding.turnId !== turnId ? [] : [...binding.pending.values()]
      if (pending.length === 0) {
        return
      }
      yield* Effect.all(
        pending.map((pendingRequest) => Deferred.await(pendingRequest.completed)),
        { discard: true },
      )
    }
  })

  const closeTurn: TurnUserInputRegistryService["closeTurn"] = Effect.fn(
    "TurnUserInputRegistry.closeTurn",
  )(function* (threadId, turnId, mode) {
    const binding = turns.get(threadId)
    if (binding === undefined || binding.turnId !== turnId) {
      return
    }
    binding.accepting = false
    if (mode !== "wait") {
      for (const [requestId, pending] of binding.pending) {
        yield* binding.emit({
          _tag: mode === "detach" ? "user-input-detached" : "user-input-cancelled",
          threadId,
          requestId: ApprovalRequestId.make(requestId),
        })
        yield* Deferred.fail(
          pending.answers,
          new UserInputRequestClosed({
            threadId,
            requestId,
            reason: mode === "detach" ? "detached" : "cancelled",
          }),
        )
      }
    }
    yield* awaitTurnIdle(threadId, turnId)
  })

  const unbindTurn: TurnUserInputRegistryService["unbindTurn"] = (threadId, turnId) =>
    Effect.gen(function* () {
      const binding = turns.get(threadId)
      if (binding === undefined || binding.turnId !== turnId) {
        return
      }
      yield* closeTurn(threadId, turnId, "detach")
      if (turns.get(threadId) === binding) {
        turns.delete(threadId)
      }
    })

  return TurnUserInputRegistry.of({
    bindTurn,
    unbindTurn,
    request,
    resolve,
    reserve,
    release,
    awaitTurnIdle,
    closeTurn,
  })
})

export const turnUserInputRegistryLayer = Layer.effect(
  TurnUserInputRegistry,
  makeTurnUserInputRegistry,
)
