import type { BoardSnapshot } from "@noyau/contracts/board"
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

  const columnIds = new Set(columns.map((column) => column.id))
  const activeTickets = snapshot.tickets.filter((ticket) => ticket.archivedAt === undefined)
  const ticketsByColumn = new Map<string, Array<(typeof snapshot.tickets)[number]>>()
  for (const ticket of activeTickets) {
    if (!columnIds.has(ticket.columnId)) {
      continue
    }
    const columnTickets = ticketsByColumn.get(ticket.columnId)
    if (columnTickets === undefined) {
      ticketsByColumn.set(ticket.columnId, [ticket])
    } else {
      columnTickets.push(ticket)
    }
  }

  const columnPositions = new Map<string, ReadonlyMap<string, number>>()
  for (const [columnId, columnTickets] of ticketsByColumn) {
    const positions = new Map<string, number>()
    for (const [position, ticket] of columnTickets.toSorted(compareRank).entries()) {
      if (!positions.has(ticket.id)) {
        positions.set(ticket.id, position)
      }
    }
    columnPositions.set(columnId, positions)
  }

  return {
    columns,
    tickets: activeTickets.map(
      (ticket) =>
        Object.assign(
          {
            id: ticket.id,
            columnId: ticket.columnId,
            position: columnPositions.get(ticket.columnId)?.get(ticket.id) ?? 0,
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
    ticketThreads: snapshot.ticketThreads,
  }
}
