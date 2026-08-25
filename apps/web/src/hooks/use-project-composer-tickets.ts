import type { BoardSnapshot } from "@noyau/protocol/board"
import type { ProjectId } from "@noyau/protocol/ids"
import { useMemo } from "react"

import { useProjectBoardSnapshot } from "@/hooks/use-project-board"
import type { ComposerTicket } from "@/lib/composer-tickets"

export const composerTicketsFromBoard = (
  snapshot: BoardSnapshot,
): ReadonlyArray<ComposerTicket> => {
  const columnsById = new Map(snapshot.columns.map((column) => [column.id, column]))
  return snapshot.tickets.flatMap((ticket) => {
    if (ticket.archivedAt !== undefined) {
      return []
    }
    const column = columnsById.get(ticket.columnId)
    return [
      {
        ticketId: ticket.id,
        title: ticket.title,
        columnName: column?.name ?? "",
        done: ticket.done,
      },
    ]
  })
}

export const useProjectComposerTickets = (projectId: ProjectId): ReadonlyArray<ComposerTicket> => {
  const snapshot = useProjectBoardSnapshot(projectId)
  return useMemo(
    () => (snapshot === undefined ? [] : composerTicketsFromBoard(snapshot)),
    [snapshot],
  )
}
