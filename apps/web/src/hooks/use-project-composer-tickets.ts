import type { BoardSnapshot } from "@noyau/protocol/board"
import type { ProjectId } from "@noyau/protocol/ids"
import { useEffect, useMemo, useState } from "react"

import type { ComposerTicket } from "@/lib/composer-tickets"
import { loadBoardSnapshot, subscribeProject } from "@/lib/control-plane"

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
  const [tickets, setTickets] = useState<ReadonlyArray<ComposerTicket>>([])

  useEffect(() => {
    return subscribeProject(projectId, undefined, {
      onSnapshot: (snapshot) => {
        setTickets(composerTicketsFromBoard(snapshot))
      },
      onEvent: () => {
        void loadBoardSnapshot(projectId).then((result) => {
          if (result.ok) {
            setTickets(composerTicketsFromBoard(result.value))
          }
          return undefined
        })
      },
      onStatus: () => undefined,
    })
  }, [projectId])

  return useMemo(() => tickets, [tickets])
}
