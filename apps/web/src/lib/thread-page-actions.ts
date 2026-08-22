import type { ClientCommandRequest } from "@noyau/protocol/commands"
import type { ThreadEnvMode } from "@noyau/protocol/entities/checkout"
import type { ModelSelection } from "@noyau/protocol/entities/model-selection"
import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import type { PrepareWorktree } from "@noyau/protocol/git"
import { ApprovalRequestId, type ProjectId, type ThreadId, type TurnId } from "@noyau/protocol/ids"
import { type Crypto, Effect } from "effect"

import type { AppFailure } from "./app-failure"
import { buildCommand, dispatchCommand } from "./control-plane"
import {
  DEFAULT_THREAD_TITLE,
  makeApprovalRespondRequest,
  makeThreadCreateRequest,
  makeThreadId,
  makeThreadModelSelectionSetRequest,
  makeThreadTurnInterruptRequest,
  makeThreadTurnStartRequest,
  makeUserInputRespondRequest,
  seedTitleFromPrompt,
} from "./thread-commands"

export type SubmitTurnResult =
  | { readonly kind: "created"; readonly threadId: ThreadId }
  | { readonly kind: "started" }
  | { readonly kind: "composer-error"; readonly failure: AppFailure }
  | { readonly kind: "error"; readonly failure: AppFailure }

const buildAndDispatch = Effect.fn("buildAndDispatch")(function* <
  A extends ClientCommandRequest,
  E,
>(request: Effect.Effect<A, E, Crypto.Crypto>) {
  const built = yield* Effect.promise(() => buildCommand(request))
  if (!built.ok) {
    return built
  }
  return yield* Effect.promise(() => dispatchCommand(built.value))
})

export const submitTurnEffect = Effect.fn("submitTurn")(function* (input: {
  readonly projectId: ProjectId
  readonly threadId: ThreadId | undefined
  readonly prompt: string
  readonly runtimeMode: RuntimeMode
  readonly modelSelection: ModelSelection | null
  readonly prepareWorktree?: PrepareWorktree
}): Effect.fn.Return<SubmitTurnResult> {
  const threadId = input.threadId
  if (threadId === undefined) {
    const nextThreadId = yield* Effect.promise(() => buildCommand(makeThreadId()))
    if (!nextThreadId.ok) {
      return { kind: "composer-error", failure: nextThreadId.failure }
    }
    const createRequest = yield* Effect.promise(() =>
      buildCommand(
        makeThreadCreateRequest({
          threadId: nextThreadId.value,
          projectId: input.projectId,
          title: DEFAULT_THREAD_TITLE,
          runtimeMode: input.runtimeMode,
          modelSelection: input.modelSelection,
        }),
      ),
    )
    if (!createRequest.ok) {
      return { kind: "composer-error", failure: createRequest.failure }
    }
    const created = yield* Effect.promise(() => dispatchCommand(createRequest.value))
    if (!created.ok) {
      return { kind: "error", failure: created.failure }
    }
    const startRequest = yield* Effect.promise(() =>
      buildCommand(
        makeThreadTurnStartRequest(
          Object.assign(
            {
              threadId: nextThreadId.value,
              text: input.prompt,
              titleSeed: seedTitleFromPrompt(input.prompt),
              runtimeMode: input.runtimeMode,
              modelSelection: input.modelSelection,
            },
            input.prepareWorktree === undefined ? {} : { prepareWorktree: input.prepareWorktree },
          ),
        ),
      ),
    )
    if (!startRequest.ok) {
      return { kind: "composer-error", failure: startRequest.failure }
    }
    const started = yield* Effect.promise(() => dispatchCommand(startRequest.value))
    if (!started.ok) {
      return { kind: "error", failure: started.failure }
    }
    return { kind: "created", threadId: nextThreadId.value }
  }

  const startRequest = yield* Effect.promise(() =>
    buildCommand(
      makeThreadTurnStartRequest(
        Object.assign(
          {
            threadId,
            text: input.prompt,
            runtimeMode: input.runtimeMode,
            modelSelection: input.modelSelection,
          },
          input.prepareWorktree === undefined ? {} : { prepareWorktree: input.prepareWorktree },
        ),
      ),
    ),
  )
  if (!startRequest.ok) {
    return { kind: "composer-error", failure: startRequest.failure }
  }
  const started = yield* Effect.promise(() => dispatchCommand(startRequest.value))
  if (!started.ok) {
    return { kind: "error", failure: started.failure }
  }
  return { kind: "started" }
})

export const submitTurn = (input: {
  readonly projectId: ProjectId
  readonly threadId: ThreadId | undefined
  readonly prompt: string
  readonly runtimeMode: RuntimeMode
  readonly modelSelection: ModelSelection | null
  readonly envMode?: ThreadEnvMode
  readonly baseBranch?: string
  readonly worktreePath?: string | null
}) => {
  const prepareWorktree =
    input.envMode === "worktree" &&
    (input.worktreePath === undefined || input.worktreePath === null) &&
    input.baseBranch !== undefined
      ? { baseBranch: input.baseBranch }
      : undefined
  return Effect.runPromise(
    submitTurnEffect(
      Object.assign(
        {
          projectId: input.projectId,
          threadId: input.threadId,
          prompt: input.prompt,
          runtimeMode: input.runtimeMode,
          modelSelection: input.modelSelection,
        },
        prepareWorktree === undefined ? {} : { prepareWorktree },
      ),
    ),
  )
}

export const interruptTurnEffect = Effect.fn("interruptTurn")(function* (input: {
  readonly threadId: ThreadId
  readonly turnId?: TurnId
}) {
  return yield* buildAndDispatch(makeThreadTurnInterruptRequest(input))
})

export const interruptTurn = (input: { readonly threadId: ThreadId; readonly turnId?: TurnId }) =>
  Effect.runPromise(interruptTurnEffect(input))

export const setThreadModelSelectionEffect = Effect.fn("setThreadModelSelection")(
  function* (input: {
    readonly threadId: ThreadId
    readonly modelSelection: ModelSelection | null
  }) {
    return yield* buildAndDispatch(makeThreadModelSelectionSetRequest(input))
  },
)

export const setThreadModelSelection = (input: {
  readonly threadId: ThreadId
  readonly modelSelection: ModelSelection | null
}) => Effect.runPromise(setThreadModelSelectionEffect(input))

export const respondToApprovalEffect = Effect.fn("respondToApproval")(function* (input: {
  readonly threadId: ThreadId
  readonly requestId: string
  readonly decision: "accept" | "decline"
}) {
  return yield* buildAndDispatch(
    makeApprovalRespondRequest({
      threadId: input.threadId,
      requestId: ApprovalRequestId.make(input.requestId),
      decision: input.decision,
    }),
  )
})

export const respondToApproval = (input: {
  readonly threadId: ThreadId
  readonly requestId: string
  readonly decision: "accept" | "decline"
}) => Effect.runPromise(respondToApprovalEffect(input))

export const respondToUserInputEffect = Effect.fn("respondToUserInput")(function* (input: {
  readonly threadId: ThreadId
  readonly requestId: string
  readonly answer: string
}) {
  return yield* buildAndDispatch(
    makeUserInputRespondRequest({
      threadId: input.threadId,
      requestId: ApprovalRequestId.make(input.requestId),
      answer: input.answer,
    }),
  )
})

export const respondToUserInput = (input: {
  readonly threadId: ThreadId
  readonly requestId: string
  readonly answer: string
}) => Effect.runPromise(respondToUserInputEffect(input))
