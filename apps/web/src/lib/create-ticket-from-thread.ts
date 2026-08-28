import type { BoardSnapshot } from "@noyau/contracts/board"
import type { ClientCommandRequest } from "@noyau/contracts/commands"
import type { ThreadSnapshot } from "@noyau/contracts/entities/thread-snapshot"
import { KanbanColumnId, type ProjectId, type ThreadId, type TicketId } from "@noyau/contracts/ids"
import { type Crypto, Effect } from "effect"

import { invalidInputFailure, type AppFailure } from "./app-failure"
import type { ControlPlaneResult } from "./control-plane"
import { threadTicketDescription } from "./thread-ticket-draft"
import {
  makeTicketCreateRequest,
  makeTicketThreadLinkRequest,
  makeTicketUpdateRequest,
} from "./ticket-commands"

export type BuildTicketCommand = <A, E>(
  request: Effect.Effect<A, E, Crypto.Crypto>,
) => Promise<ControlPlaneResult<A>>

export type ThreadTicketDraftSource = Pick<ThreadSnapshot, "transcript"> & {
  readonly thread: Pick<ThreadSnapshot["thread"], "title">
}

export type TicketCreationBoard = {
  readonly columns: ReadonlyArray<Pick<BoardSnapshot["columns"][number], "id" | "done">>
}

export interface CreateTicketFromThreadOptions {
  readonly projectId: ProjectId
  readonly threadId: ThreadId
  readonly snapshot: ThreadTicketDraftSource
  readonly board: TicketCreationBoard
  readonly buildCommand: BuildTicketCommand
  readonly dispatch: (request: ClientCommandRequest) => Promise<boolean>
  readonly onError: (failure: AppFailure) => void
  readonly onTicketCreated: (ticketId: TicketId) => void
}

export const createTicketFromThreadEffect = Effect.fn("createTicketFromThread")(function* ({
  projectId,
  threadId,
  snapshot,
  board,
  buildCommand,
  dispatch,
  onError,
  onTicketCreated,
}: CreateTicketFromThreadOptions) {
  const column = board.columns.find((candidate) => !candidate.done)
  if (column === undefined) {
    onError(invalidInputFailure("No non-terminal column is available to create a Ticket."))
    return
  }

  const createRequest = yield* Effect.promise(() =>
    buildCommand(
      makeTicketCreateRequest({
        projectId,
        title: snapshot.thread.title,
        placement: { columnId: KanbanColumnId.make(column.id) },
      }),
    ),
  )
  if (!createRequest.ok) {
    onError(createRequest.failure)
    return
  }

  const ticketId = createRequest.value.payload.ticketId
  if (!(yield* Effect.promise(() => dispatch(createRequest.value)))) {
    return
  }

  const description = threadTicketDescription(snapshot.transcript)
  if (description !== "") {
    const updateRequest = yield* Effect.promise(() =>
      buildCommand(makeTicketUpdateRequest({ ticketId, description })),
    )
    if (!updateRequest.ok) {
      onError(updateRequest.failure)
      return
    }
    if (!(yield* Effect.promise(() => dispatch(updateRequest.value)))) {
      return
    }
  }

  const linkRequest = yield* Effect.promise(() =>
    buildCommand(makeTicketThreadLinkRequest({ ticketId, threadId })),
  )
  if (!linkRequest.ok) {
    onError(linkRequest.failure)
    return
  }
  if (!(yield* Effect.promise(() => dispatch(linkRequest.value)))) {
    return
  }

  onTicketCreated(ticketId)
})

export const createTicketFromThread = (options: CreateTicketFromThreadOptions) =>
  Effect.runPromise(createTicketFromThreadEffect(options))
