import type { ClientCommandRequest } from "@noyau/protocol/commands"
import type { ProviderUserInputAnswers } from "@noyau/protocol/entities/approvals"
import type { TurnImageUpload } from "@noyau/protocol/entities/attachment"
import type { ThreadEnvMode } from "@noyau/protocol/entities/checkout"
import type { Provider } from "@noyau/protocol/entities/environment"
import type { ModelSelection } from "@noyau/protocol/entities/model-selection"
import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import type { TurnPresentation } from "@noyau/protocol/entities/transcript"
import type { PrepareWorktree } from "@noyau/protocol/git"
import {
  ApprovalRequestId,
  TicketId,
  type ProjectId,
  type ThreadId,
  type TurnId,
} from "@noyau/protocol/ids"
import { collectComposerTicketIds } from "@noyau/shared/composer-inline-tokens"
import { type Crypto, Effect } from "effect"

import type { AppFailure } from "./app-failure"
import { resolvePrepareWorktree } from "./checkout"
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
  seedTitleFromTurn,
} from "./thread-commands"
import { makeTicketThreadLinkRequest } from "./ticket-commands"

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

const isAlreadyLinked = (failure: {
  readonly _tag: string
  readonly rejection?: { readonly _tag: string }
}) => failure._tag === "Rejected" && failure.rejection?._tag === "TicketThreadAlreadyLinked"

const linkMentionedTickets = Effect.fn("linkMentionedTickets")(function* (input: {
  readonly threadId: ThreadId
  readonly prompt: string
}) {
  for (const ticketId of collectComposerTicketIds(input.prompt)) {
    const linked = yield* buildAndDispatch(
      makeTicketThreadLinkRequest({
        ticketId: TicketId.make(ticketId),
        threadId: input.threadId,
      }),
    )
    if (!linked.ok && !isAlreadyLinked(linked.failure)) {
      return
    }
  }
})

export const submitTurnEffect = Effect.fn("submitTurn")(function* (input: {
  readonly projectId: ProjectId
  readonly threadId: ThreadId | undefined
  readonly prompt: string
  readonly runtimeMode: RuntimeMode
  readonly provider?: Provider
  readonly modelSelection: ModelSelection | null
  readonly branch?: string
  readonly worktreePath?: string | null
  readonly prepareWorktree?: PrepareWorktree
  readonly attachments?: ReadonlyArray<TurnImageUpload>
  readonly titleSeed?: string
  readonly presentation?: TurnPresentation
}): Effect.fn.Return<SubmitTurnResult> {
  const threadId = input.threadId
  if (threadId === undefined) {
    const nextThreadId = yield* Effect.promise(() => buildCommand(makeThreadId()))
    if (!nextThreadId.ok) {
      return { kind: "composer-error", failure: nextThreadId.failure }
    }
    const createRequest = yield* Effect.promise(() =>
      buildCommand(
        makeThreadCreateRequest(
          Object.assign(
            {
              threadId: nextThreadId.value,
              projectId: input.projectId,
              title: DEFAULT_THREAD_TITLE,
              runtimeMode: input.runtimeMode,
              modelSelection: input.modelSelection,
            },
            input.provider === undefined ? {} : { provider: input.provider },
            input.branch === undefined ? {} : { branch: input.branch },
            input.worktreePath === undefined || input.worktreePath === null
              ? {}
              : { worktreePath: input.worktreePath },
          ),
        ),
      ),
    )
    if (!createRequest.ok) {
      return { kind: "composer-error", failure: createRequest.failure }
    }
    const created = yield* Effect.promise(() => dispatchCommand(createRequest.value))
    if (!created.ok) {
      return { kind: "error", failure: created.failure }
    }
    yield* linkMentionedTickets({
      threadId: nextThreadId.value,
      prompt: input.prompt,
    })
    const startRequest = yield* Effect.promise(() =>
      buildCommand(
        makeThreadTurnStartRequest(
          Object.assign(
            {
              threadId: nextThreadId.value,
              text: input.prompt,
              titleSeed: input.titleSeed ?? seedTitleFromTurn(input.prompt, input.attachments),
              runtimeMode: input.runtimeMode,
              modelSelection: input.modelSelection,
            },
            input.prepareWorktree === undefined ? {} : { prepareWorktree: input.prepareWorktree },
            input.attachments === undefined ? {} : { attachments: input.attachments },
            input.presentation === undefined ? {} : { presentation: input.presentation },
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

  yield* linkMentionedTickets({
    threadId,
    prompt: input.prompt,
  })
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
          input.titleSeed === undefined ? {} : { titleSeed: input.titleSeed },
          input.prepareWorktree === undefined ? {} : { prepareWorktree: input.prepareWorktree },
          input.attachments === undefined ? {} : { attachments: input.attachments },
          input.presentation === undefined ? {} : { presentation: input.presentation },
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
  readonly provider?: Provider
  readonly modelSelection: ModelSelection | null
  readonly envMode?: ThreadEnvMode
  readonly baseBranch?: string
  readonly startFromOrigin?: boolean
  readonly worktreePath?: string | null
  readonly attachments?: ReadonlyArray<TurnImageUpload>
  readonly titleSeed?: string
  readonly presentation?: TurnPresentation
}) => {
  const prepareWorktree = resolvePrepareWorktree(
    Object.assign(
      {},
      input.envMode === undefined ? {} : { envMode: input.envMode },
      input.worktreePath === undefined ? {} : { worktreePath: input.worktreePath },
      input.baseBranch === undefined ? {} : { baseBranch: input.baseBranch },
      input.startFromOrigin === undefined ? {} : { startFromOrigin: input.startFromOrigin },
    ),
  )
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
        input.provider === undefined ? {} : { provider: input.provider },
        input.baseBranch === undefined ? {} : { branch: input.baseBranch },
        input.worktreePath === undefined ? {} : { worktreePath: input.worktreePath },
        prepareWorktree === undefined ? {} : { prepareWorktree },
        input.attachments === undefined ? {} : { attachments: input.attachments },
        input.titleSeed === undefined ? {} : { titleSeed: input.titleSeed },
        input.presentation === undefined ? {} : { presentation: input.presentation },
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
  readonly answers: ProviderUserInputAnswers
}) {
  return yield* buildAndDispatch(
    makeUserInputRespondRequest({
      threadId: input.threadId,
      requestId: ApprovalRequestId.make(input.requestId),
      answers: input.answers,
    }),
  )
})

export const respondToUserInput = (input: {
  readonly threadId: ThreadId
  readonly requestId: string
  readonly answers: ProviderUserInputAnswers
}) => Effect.runPromise(respondToUserInputEffect(input))
