import type { BoardSnapshot } from "@noyau/protocol/board"
import type { ClientCommandRequest } from "@noyau/protocol/commands"
import type { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import { KanbanColumnId, type ProjectId, type ThreadId, type TicketId } from "@noyau/protocol/ids"
import type { Crypto, Effect } from "effect"

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
  readonly onError: (details: string) => void
  readonly onTicketCreated: (ticketId: TicketId) => void
}

export const createTicketFromThread = async ({
  projectId,
  threadId,
  snapshot,
  board,
  buildCommand,
  dispatch,
  onError,
  onTicketCreated,
}: CreateTicketFromThreadOptions): Promise<void> => {
  const column = board.columns.find((candidate) => !candidate.done)
  if (column === undefined) {
    onError("Aucune colonne non terminale ne permet de créer un Ticket.")
    return
  }

  const createRequest = await buildCommand(
    makeTicketCreateRequest({
      projectId,
      title: snapshot.thread.title,
      placement: { columnId: KanbanColumnId.make(column.id) },
    }),
  )
  if (!createRequest.ok) {
    onError(createRequest.details)
    return
  }

  const ticketId = createRequest.value.payload.ticketId
  if (!(await dispatch(createRequest.value))) {
    return
  }

  const description = threadTicketDescription(snapshot.transcript)
  if (description !== "") {
    const updateRequest = await buildCommand(makeTicketUpdateRequest({ ticketId, description }))
    if (!updateRequest.ok) {
      onError(updateRequest.details)
      return
    }
    if (!(await dispatch(updateRequest.value))) {
      return
    }
  }

  const linkRequest = await buildCommand(makeTicketThreadLinkRequest({ ticketId, threadId }))
  if (!linkRequest.ok) {
    onError(linkRequest.details)
    return
  }
  if (!(await dispatch(linkRequest.value))) {
    return
  }

  onTicketCreated(ticketId)
}
