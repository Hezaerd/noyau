import type { TicketPriority } from "@noyau/protocol/entities/ticket"
import type { ActorId, ExecutionId, KanbanColumnId, TicketId } from "@noyau/protocol/ids"
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
  readonly activeExecutionId?: ExecutionId
}

export interface BoardState {
  readonly columns: ReadonlyArray<ColumnState>
  readonly tickets: ReadonlyArray<TicketState>
  readonly executionIds: ReadonlyArray<ExecutionId>
}

export const emptyBoardState: BoardState = {
  columns: [],
  tickets: [],
  executionIds: [],
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
      return updateTicket(state, event.ticketId, (ticket) => ({
        ...ticket,
        columnId: event.doneColumnId,
        rank: event.rank,
        done: true,
        lastActiveColumnId: event.previousColumnId,
      }))
    case "ticket.reopened":
      return updateTicket(state, event.ticketId, (ticket) => ({
        ...ticket,
        columnId: event.columnId,
        rank: event.rank,
        done: false,
      }))
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
      return updateTicket(state, event.ticketId, (ticket) => ({
        ...ticket,
        ...(event.title === undefined ? {} : { title: event.title }),
        ...(event.description === undefined ? {} : { description: event.description }),
        ...(event.priority === undefined ? {} : { priority: event.priority }),
      }))
    case "execution.started":
      return {
        ...updateTicket(state, event.ticketId, (ticket) => ({
          ...ticket,
          activeExecutionId: event.executionId,
        })),
        executionIds: [...state.executionIds, event.executionId],
      }
  }
}

export const replay = (events: Iterable<TicketEvent>): BoardState => {
  let state = emptyBoardState
  for (const event of events) {
    state = evolve(state, event)
  }
  return state
}
