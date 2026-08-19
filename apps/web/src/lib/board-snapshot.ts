import type { BoardSnapshot } from "@noyau/protocol/board"
import { DateTime } from "effect"

import type { BoardState, BoardTicket } from "./board-model"

const compareRank = (left: { readonly rank: string }, right: { readonly rank: string }) =>
  left.rank < right.rank ? -1 : left.rank > right.rank ? 1 : 0

export const boardStateFromSnapshot = (snapshot: BoardSnapshot): BoardState => {
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
    columns,
    tickets: snapshot.tickets
      .filter((ticket) => ticket.archivedAt === undefined)
      .map(
        (ticket) =>
          Object.assign(
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
            },
            ticket.dueAt === undefined ? {} : { dueAt: DateTime.formatIso(ticket.dueAt) },
          ) satisfies BoardTicket,
      ),
    ticketDependencies: snapshot.ticketDependencies.map((dependency) => ({
      ticketId: dependency.ticketId,
      dependsOnTicketId: dependency.dependsOnTicketId,
    })),
  }
}
