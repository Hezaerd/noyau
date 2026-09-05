import type { TicketPriority } from "@noyau/contracts/entities/ticket"
import type { ActorId, KanbanColumnId, ThreadId, TicketId } from "@noyau/contracts/ids"
import type { TicketEvent } from "@noyau/contracts/ticket/events"
import type { DateTime } from "effect"

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
  readonly dueAt?: DateTime.Utc
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

export interface TicketThreadState {
  readonly ticketId: TicketId
  readonly threadId: ThreadId
}

export interface BoardState {
  readonly columns: ReadonlyArray<ColumnState>
  readonly tickets: ReadonlyArray<TicketState>
  readonly dependencies: ReadonlyArray<TicketDependencyState>
  readonly ticketThreads: ReadonlyArray<TicketThreadState>
  /** Threads du Project, fournis par la projection Thread — pas dérivés des faits Ticket. */
  readonly projectThreadIds: ReadonlyArray<ThreadId>
}

export const emptyBoardState: BoardState = {
  columns: [],
  tickets: [],
  dependencies: [],
  ticketThreads: [],
  projectThreadIds: [],
}

/** Compose les Threads connus du Project avant une décision TicketThread. */
export const withProjectThreads = (
  state: BoardState,
  projectThreadIds: ReadonlyArray<ThreadId>,
): BoardState => ({ ...state, projectThreadIds })

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

const withoutDueAt = (ticket: TicketState): TicketState => {
  const { dueAt, ...without } = ticket
  void dueAt
  return without
}

const withDerivedOpenDependencies = (state: BoardState): BoardState => {
  const ticketsById = new Map<TicketId, TicketState>()
  for (const ticket of state.tickets) {
    if (!ticketsById.has(ticket.ticketId)) {
      ticketsById.set(ticket.ticketId, ticket)
    }
  }

  const dependenciesByTicketId = new Map<TicketId, Array<TicketDependencyState>>()
  for (const dependency of state.dependencies) {
    const dependencies = dependenciesByTicketId.get(dependency.ticketId)
    if (dependencies === undefined) {
      dependenciesByTicketId.set(dependency.ticketId, [dependency])
    } else {
      dependencies.push(dependency)
    }
  }

  return {
    ...state,
    tickets: state.tickets.map((ticket) => ({
      ...ticket,
      openDependencyIds: (dependenciesByTicketId.get(ticket.ticketId) ?? [])
        .filter((dependency) => ticketsById.get(dependency.dependsOnTicketId)?.done === false)
        .map((dependency) => dependency.dependsOnTicketId),
    })),
  }
}

export const evolve = (state: BoardState, event: TicketEvent): BoardState => {
  switch (event._tag) {
    case "board.initialized":
      return state
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
        const dated =
          event.dueAt === null
            ? withoutDueAt(described)
            : event.dueAt === undefined
              ? described
              : { ...described, dueAt: event.dueAt }
        const updated = { ...dated }
        if (event.title !== undefined) {
          updated.title = event.title
        }
        if (event.priority !== undefined) {
          updated.priority = event.priority
        }
        return updated
      })
    case "ticket.thread.linked":
      return {
        ...state,
        ticketThreads: [
          ...state.ticketThreads,
          { ticketId: event.ticketId, threadId: event.threadId },
        ],
      }
    case "ticket.thread.unlinked":
      return {
        ...state,
        ticketThreads: state.ticketThreads.filter(
          (link) => link.ticketId !== event.ticketId || link.threadId !== event.threadId,
        ),
      }
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
