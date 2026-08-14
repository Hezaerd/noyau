import type { BoardSnapshot } from "@noyau/protocol/board"
import { DateTime } from "effect"

import { boardActors, type BoardState, type BoardTicket } from "./board-model"

const compareRank = (left: { readonly rank: string }, right: { readonly rank: string }) =>
  left.rank < right.rank ? -1 : left.rank > right.rank ? 1 : 0

export const boardStateFromSnapshot = (
  snapshot: BoardSnapshot,
  previous?: BoardState,
): BoardState => {
  const columns = snapshot.columns.toSorted(compareRank).map((column) => ({
    id: column.id,
    name: column.name,
    color: column.color,
    done: column.done,
  }))

  const columnPositions = new Map(
    columns.map((column) => [
      column.id,
      snapshot.tickets
        .filter((ticket) => ticket.columnId === column.id && ticket.archivedAt === undefined)
        .toSorted(compareRank)
        .map((ticket, position) => [ticket.id, position] as const),
    ]),
  )

  return {
    actors: previous?.actors ?? boardActors,
    columns,
    tickets: snapshot.tickets
      .filter((ticket) => ticket.archivedAt === undefined)
      .map((ticket) => {
        const previousTicket = previous?.tickets.find((candidate) => candidate.id === ticket.id)
        return Object.assign(
          {
            id: ticket.id,
            columnId: ticket.columnId,
            position:
              columnPositions
                .get(ticket.columnId)
                ?.find(([ticketId]) => ticketId === ticket.id)?.[1] ?? 0,
            title: ticket.title,
            description: ticket.description ?? "",
            priority: ticket.priority,
            labels: previousTicket?.labels ?? [],
            checklist:
              ticket.checklist.length === 0
                ? (previousTicket?.checklist ?? [])
                : ticket.checklist.map((item) => ({
                    id: item.id,
                    title: item.title,
                    done: item.completed,
                  })),
            blockedBy: previousTicket?.blockedBy ?? [],
            messages: previousTicket?.messages ?? [],
            activity: previousTicket?.activity ?? [],
          },
          ticket.dueAt === undefined ? {} : { dueAt: DateTime.formatIso(ticket.dueAt) },
          ticket.assigneeId === undefined ? {} : { assigneeId: ticket.assigneeId },
          previousTicket?.execution === undefined ? {} : { execution: previousTicket.execution },
        ) satisfies BoardTicket
      }),
  }
}
