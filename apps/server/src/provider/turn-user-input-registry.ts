import type {
  ProviderUserInputAnswers,
  UserInputQuestion,
} from "@noyau/contracts/entities/approvals"
import type { TranscriptUserInput } from "@noyau/contracts/entities/transcript"
import type { ApprovalRequestId, ThreadId, TurnId } from "@noyau/contracts/ids"
import { Context, Deferred, Effect, Layer, Schema } from "effect"

import type { ProviderEmit } from "./provider-port.ts"

export class UserInputTurnInactive extends Schema.TaggedError<UserInputTurnInactive>()(
  "UserInputTurnInactive",
  { threadId: Schema.String },
) {}

export interface UserInputRequest {
  readonly threadId: ThreadId
  readonly turnId: TurnId
  readonly requestId: ApprovalRequestId
  readonly title?: string | undefined
  readonly prompt?: string | undefined
  readonly questions?: ReadonlyArray<UserInputQuestion> | undefined
}

interface TurnBinding {
  readonly emit: ProviderEmit
  readonly pending: Map<string, Deferred.Deferred<ProviderUserInputAnswers>>
}

export interface TurnUserInputRegistryService {
  readonly bindTurn: (threadId: ThreadId, emit: ProviderEmit) => Effect.Effect<void>
  readonly unbindTurn: (threadId: ThreadId) => Effect.Effect<void>
  readonly request: (
    input: UserInputRequest,
  ) => Effect.Effect<ProviderUserInputAnswers, UserInputTurnInactive>
  readonly resolve: (
    threadId: ThreadId,
    requestId: ApprovalRequestId,
    answers: ProviderUserInputAnswers,
  ) => Effect.Effect<void>
  readonly cancelTurn: (threadId: ThreadId) => Effect.Effect<void>
}

export class TurnUserInputRegistry extends Context.Service<
  TurnUserInputRegistry,
  TurnUserInputRegistryService
>()("@noyau/server/provider/TurnUserInputRegistry") {}

const pendingKey = (requestId: ApprovalRequestId): string => requestId

export const makeTurnUserInputRegistry = Effect.sync(() => {
  const turns = new Map<string, TurnBinding>()

  const bindTurn: TurnUserInputRegistryService["bindTurn"] = (threadId, emit) =>
    Effect.sync(() => {
      turns.set(threadId, { emit, pending: new Map() })
    })

  const unbindTurn: TurnUserInputRegistryService["unbindTurn"] = (threadId) =>
    Effect.gen(function* () {
      const binding = turns.get(threadId)
      if (binding === undefined) {
        return
      }
      for (const deferred of binding.pending.values()) {
        yield* Deferred.succeed(deferred, {})
      }
      turns.delete(threadId)
    })

  const request: TurnUserInputRegistryService["request"] = Effect.fn(
    "TurnUserInputRegistry.request",
  )(function* (input) {
    const binding = turns.get(input.threadId)
    if (binding === undefined) {
      return yield* new UserInputTurnInactive({ threadId: input.threadId })
    }
    const deferred = yield* Deferred.make<ProviderUserInputAnswers>()
    binding.pending.set(pendingKey(input.requestId), deferred)

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
    yield* binding.emit({ _tag: "transcript", item: pendingItem })

    const answers = yield* Deferred.await(deferred)
    binding.pending.delete(pendingKey(input.requestId))
    yield* binding.emit({
      _tag: "transcript",
      item: { ...pendingItem, status: "resolved", answers },
    })
    return answers
  })

  const resolve: TurnUserInputRegistryService["resolve"] = (threadId, requestId, answers) =>
    Effect.gen(function* () {
      const deferred = turns.get(threadId)?.pending.get(pendingKey(requestId))
      if (deferred !== undefined) {
        yield* Deferred.succeed(deferred, answers)
      }
    })

  const cancelTurn: TurnUserInputRegistryService["cancelTurn"] = (threadId) =>
    Effect.gen(function* () {
      const binding = turns.get(threadId)
      if (binding === undefined) {
        return
      }
      for (const deferred of binding.pending.values()) {
        yield* Deferred.succeed(deferred, {})
      }
      binding.pending.clear()
    })

  return TurnUserInputRegistry.of({
    bindTurn,
    unbindTurn,
    request,
    resolve,
    cancelTurn,
  })
})

export const turnUserInputRegistryLayer = Layer.effect(
  TurnUserInputRegistry,
  makeTurnUserInputRegistry,
)
