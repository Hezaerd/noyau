import type { TicketPriority } from "@noyau/protocol/entities/ticket"
import type { ActorId, KanbanColumnId, TicketId } from "@noyau/protocol/ids"
import type { TicketEvent } from "@noyau/protocol/ticket/events"

export interface ColumnState {
  readonly columnId: KanbanColumnId
  readonly rank: string
  readonly done: boolean
}

export interface TicketState {
  readonly ticketId: TicketId
  readonly columnId: KanbanColumnId
  readonly rank: string
  readonly title: string
  readonly description?: string
  readonly priority: TicketPriority
  readonly done: boolean
  readonly archived: boolean
  readonly lastActiveColumnId?: KanbanColumnId
  readonly assigneeId?: ActorId
  readonly openDependencyIds: ReadonlyArray<TicketId>
}

export interface TicketDependencyState {
  readonly ticketId: TicketId
  readonly dependsOnTicketId: TicketId
}

export interface BoardState {
  readonly columns: ReadonlyArray<ColumnState>
  readonly tickets: ReadonlyArray<TicketState>
  readonly dependencies: ReadonlyArray<TicketDependencyState>
}

export const emptyBoardState: BoardState = {
  columns: [],
  tickets: [],
  dependencies: [],
}

const updateTicket = (
  state: BoardState,
  ticketId: TicketId,
  update: (ticket: TicketState) => TicketState,
): BoardState => ({
  ...state,
  tickets: state.tickets.map((ticket) => (ticket.ticketId === ticketId ? update(ticket) : ticket)),
})

const withoutAssignee = (ticket: TicketState): TicketState => {
  const { assigneeId, ...unassigned } = ticket
  void assigneeId
  return unassigned
}

const withoutDescription = (ticket: TicketState): TicketState => {
  const { description, ...without } = ticket
  void description
  return without
}

const withDerivedOpenDependencies = (state: BoardState): BoardState => ({
  ...state,
  tickets: state.tickets.map((ticket) => ({
    ...ticket,
    openDependencyIds: state.dependencies
      .filter((dependency) => dependency.ticketId === ticket.ticketId)
      .filter(
        (dependency) =>
          state.tickets.find((candidate) => candidate.ticketId === dependency.dependsOnTicketId)
            ?.done === false,
      )
      .map((dependency) => dependency.dependsOnTicketId),
  })),
})

export const evolve = (state: BoardState, event: TicketEvent): BoardState => {
  switch (event._tag) {
    case "kanbanColumn.created":
      return {
        ...state,
        columns: [
          ...state.columns,
          { columnId: event.columnId, rank: event.rank, done: event.done },
        ],
      }
    case "kanbanColumn.updated":
      return state
    case "kanbanColumn.moved":
      return {
        ...state,
        columns: state.columns.map((column) =>
          column.columnId === event.columnId ? { ...column, rank: event.rank } : column,
        ),
      }
    case "kanbanColumn.deleted":
      return {
        ...state,
        columns: state.columns.filter((column) => column.columnId !== event.columnId),
        tickets:
          event.destinationColumnId === undefined
            ? state.tickets
            : state.tickets.map((ticket) => {
                const destinationColumnId = event.destinationColumnId
                const next = { ...ticket }
                if (
                  destinationColumnId !== undefined &&
                  ticket.archived &&
                  ticket.columnId === event.columnId
                ) {
                  next.columnId = destinationColumnId
                }
                if (
                  destinationColumnId !== undefined &&
                  ticket.done &&
                  ticket.lastActiveColumnId === event.columnId
                ) {
                  next.lastActiveColumnId = destinationColumnId
                }
                return next
              }),
      }
    case "ticket.created":
      return {
        ...state,
        tickets: [
          ...state.tickets,
          {
            ticketId: event.ticketId,
            columnId: event.columnId,
            rank: event.rank,
            title: event.title,
            priority: "none",
            done: false,
            archived: false,
            openDependencyIds: [],
          },
        ],
      }
    case "ticket.moved":
      return updateTicket(state, event.ticketId, (ticket) => ({
        ...ticket,
        columnId: event.columnId,
        rank: event.rank,
      }))
    case "ticket.completed":
      return withDerivedOpenDependencies(
        updateTicket(state, event.ticketId, (ticket) => ({
          ...ticket,
          columnId: event.doneColumnId,
          rank: event.rank,
          done: true,
          lastActiveColumnId: event.previousColumnId,
        })),
      )
    case "ticket.reopened":
      return withDerivedOpenDependencies(
        updateTicket(state, event.ticketId, (ticket) => ({
          ...ticket,
          columnId: event.columnId,
          rank: event.rank,
          done: false,
        })),
      )
    case "ticket.archived":
      return updateTicket(state, event.ticketId, (ticket) => ({ ...ticket, archived: true }))
    case "ticket.restored":
      return updateTicket(state, event.ticketId, (ticket) => ({
        ...ticket,
        columnId: event.columnId,
        rank: event.rank,
        archived: false,
      }))
    case "ticket.assigned":
      return updateTicket(state, event.ticketId, (ticket) =>
        event.assigneeId === undefined
          ? withoutAssignee(ticket)
          : { ...ticket, assigneeId: event.assigneeId },
      )
    case "ticket.updated":
      return updateTicket(state, event.ticketId, (ticket) => {
        const described =
          event.description === null
            ? withoutDescription(ticket)
            : event.description === undefined
              ? ticket
              : { ...ticket, description: event.description }
        const updated = { ...described }
        if (event.title !== undefined) {
          updated.title = event.title
        }
        if (event.priority !== undefined) {
          updated.priority = event.priority
        }
        return updated
      })
    case "ticket.dependency.added":
      return withDerivedOpenDependencies({
        ...state,
        dependencies: [
          ...state.dependencies,
          { ticketId: event.ticketId, dependsOnTicketId: event.dependsOnTicketId },
        ],
      })
    case "ticket.dependency.removed":
      return withDerivedOpenDependencies({
        ...state,
        dependencies: state.dependencies.filter(
          (dependency) =>
            dependency.ticketId !== event.ticketId ||
            dependency.dependsOnTicketId !== event.dependsOnTicketId,
        ),
      })
  }
}

export const replay = (events: Iterable<TicketEvent>): BoardState => {
  let state = emptyBoardState
  for (const event of events) {
    state = evolve(state, event)
  }
  return state
}
