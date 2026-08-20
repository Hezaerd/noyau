import type { BoardSnapshot } from "@noyau/protocol/board"
import type { ClientCommandRequest } from "@noyau/protocol/commands"
import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import {
  ApprovalRequestId,
  type ProjectId,
  type ThreadId,
  type TicketId,
  type TurnId,
} from "@noyau/protocol/ids"
import { type Crypto, Effect } from "effect"

import {
  buildCommand,
  dispatchCommand,
  loadBoardSnapshot,
  type ControlPlaneResult,
} from "./control-plane"
import {
  DEFAULT_THREAD_TITLE,
  makeApprovalRespondRequest,
  makeThreadCreateRequest,
  makeThreadId,
  makeThreadTurnInterruptRequest,
  makeThreadTurnStartRequest,
  makeUserInputRespondRequest,
  seedTitleFromPrompt,
} from "./thread-commands"
import { makeTicketThreadLinkRequest, makeTicketThreadUnlinkRequest } from "./ticket-commands"

export type SubmitTurnResult =
  | { readonly kind: "created"; readonly threadId: ThreadId }
  | { readonly kind: "started" }
  | { readonly kind: "composer-error"; readonly details: string }
  | { readonly kind: "error"; readonly details: string }

export type ThreadLinkResult =
  | { readonly ok: true; readonly board: ControlPlaneResult<BoardSnapshot> }
  | { readonly ok: false; readonly details: string }

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
}): Effect.fn.Return<SubmitTurnResult> {
  const threadId = input.threadId
  if (threadId === undefined) {
    const nextThreadId = yield* Effect.promise(() => buildCommand(makeThreadId()))
    if (!nextThreadId.ok) {
      return { kind: "composer-error", details: nextThreadId.details }
    }
    const createRequest = yield* Effect.promise(() =>
      buildCommand(
        makeThreadCreateRequest({
          threadId: nextThreadId.value,
          projectId: input.projectId,
          title: DEFAULT_THREAD_TITLE,
          runtimeMode: input.runtimeMode,
        }),
      ),
    )
    if (!createRequest.ok) {
      return { kind: "composer-error", details: createRequest.details }
    }
    const created = yield* Effect.promise(() => dispatchCommand(createRequest.value))
    if (!created.ok) {
      return { kind: "error", details: created.details }
    }
    const startRequest = yield* Effect.promise(() =>
      buildCommand(
        makeThreadTurnStartRequest({
          threadId: nextThreadId.value,
          text: input.prompt,
          titleSeed: seedTitleFromPrompt(input.prompt),
          runtimeMode: input.runtimeMode,
        }),
      ),
    )
    if (!startRequest.ok) {
      return { kind: "composer-error", details: startRequest.details }
    }
    const started = yield* Effect.promise(() => dispatchCommand(startRequest.value))
    if (!started.ok) {
      return { kind: "error", details: started.details }
    }
    return { kind: "created", threadId: nextThreadId.value }
  }

  const startRequest = yield* Effect.promise(() =>
    buildCommand(
      makeThreadTurnStartRequest({
        threadId,
        text: input.prompt,
        runtimeMode: input.runtimeMode,
      }),
    ),
  )
  if (!startRequest.ok) {
    return { kind: "composer-error", details: startRequest.details }
  }
  const started = yield* Effect.promise(() => dispatchCommand(startRequest.value))
  if (!started.ok) {
    return { kind: "error", details: started.details }
  }
  return { kind: "started" }
})

export const submitTurn = (input: {
  readonly projectId: ProjectId
  readonly threadId: ThreadId | undefined
  readonly prompt: string
  readonly runtimeMode: RuntimeMode
}) => Effect.runPromise(submitTurnEffect(input))

export const interruptTurnEffect = Effect.fn("interruptTurn")(function* (input: {
  readonly threadId: ThreadId
  readonly turnId?: TurnId
}) {
  return yield* buildAndDispatch(makeThreadTurnInterruptRequest(input))
})

export const interruptTurn = (input: { readonly threadId: ThreadId; readonly turnId?: TurnId }) =>
  Effect.runPromise(interruptTurnEffect(input))

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

export const linkTicketEffect = Effect.fn("linkTicket")(function* (input: {
  readonly threadId: ThreadId
  readonly ticketId: TicketId
  readonly projectId: ProjectId
}): Effect.fn.Return<ThreadLinkResult> {
  const result = yield* buildAndDispatch(
    makeTicketThreadLinkRequest({ ticketId: input.ticketId, threadId: input.threadId }),
  )
  if (!result.ok) {
    return result
  }
  const board = yield* Effect.promise(() => loadBoardSnapshot(input.projectId))
  return { ok: true, board }
})

export const linkTicket = (input: {
  readonly threadId: ThreadId
  readonly ticketId: TicketId
  readonly projectId: ProjectId
}) => Effect.runPromise(linkTicketEffect(input))

export const unlinkTicketEffect = Effect.fn("unlinkTicket")(function* (input: {
  readonly threadId: ThreadId
  readonly ticketId: TicketId
  readonly projectId: ProjectId
}): Effect.fn.Return<ThreadLinkResult> {
  const result = yield* buildAndDispatch(
    makeTicketThreadUnlinkRequest({ ticketId: input.ticketId, threadId: input.threadId }),
  )
  if (!result.ok) {
    return result
  }
  const board = yield* Effect.promise(() => loadBoardSnapshot(input.projectId))
  return { ok: true, board }
})

export const unlinkTicket = (input: {
  readonly threadId: ThreadId
  readonly ticketId: TicketId
  readonly projectId: ProjectId
}) => Effect.runPromise(unlinkTicketEffect(input))
