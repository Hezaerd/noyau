import type { TicketPriority } from "@noyau/contracts/entities/ticket"
import type { TicketThread } from "@noyau/contracts/entities/ticket-thread"
import { Schema } from "effect"

export interface BoardColumn {
  readonly id: string
  readonly name: string
  readonly color: string
  readonly done: boolean
}

export interface BoardTicket {
  readonly id: string
  readonly columnId: string
  readonly position: number
  readonly title: string
  readonly description: string
  readonly priority: TicketPriority
  readonly dueAt?: string
}

export interface BoardTicketDependency {
  readonly ticketId: string
  readonly dependsOnTicketId: string
}

export interface BoardState {
  readonly columns: ReadonlyArray<BoardColumn>
  readonly tickets: ReadonlyArray<BoardTicket>
  readonly ticketDependencies: ReadonlyArray<BoardTicketDependency>
  readonly ticketThreads: ReadonlyArray<TicketThread>
}

export interface BoardFilters {
  readonly query: string
  readonly priority?: TicketPriority
}

export interface BoardSearch {
  readonly ticket?: string
  readonly q?: string
  readonly priority?: TicketPriority
}

export interface BoardSearchPatch {
  readonly ticket?: string | undefined
  readonly q?: string | undefined
  readonly priority?: TicketPriority | undefined
}

export interface BoardTicketPatch {
  readonly title?: string
  readonly description?: string
  readonly priority?: TicketPriority
  readonly dueAt?: string | undefined
}

export type TicketDependencyIssue = "self" | "duplicate" | "cycle"

export const priorities = ["none", "low", "normal", "high", "urgent"] as const
export const isTicketPriority = (value: string): value is TicketPriority =>
  priorities.some((priority) => priority === value)

const BoardSearchInput = Schema.Struct({
  ticket: Schema.optionalKey(Schema.String),
  q: Schema.optionalKey(Schema.String),
  priority: Schema.optionalKey(Schema.String),
})

type BoardSearchParams = Record<string, string | undefined>

const decodeBoardSearchInput = Schema.decodeUnknownSync(BoardSearchInput)

const trimmedOptional = (value: string | undefined): string | undefined =>
  value !== undefined && value.trim() !== "" ? value : undefined

export const parseBoardSearch = (search: BoardSearchParams): BoardSearch => {
  const decoded = decodeBoardSearchInput(search)
  const result = {}
  const ticket = trimmedOptional(decoded.ticket)
  if (ticket !== undefined) {
    Object.assign(result, { ticket })
  }
  const query = trimmedOptional(decoded.q)
  if (query !== undefined) {
    Object.assign(result, { q: query })
  }
  const priority = trimmedOptional(decoded.priority)
  if (priority !== undefined && isTicketPriority(priority)) {
    Object.assign(result, { priority })
  }
  return result
}

export const isFiltered = (filters: BoardFilters): boolean =>
  filters.query.trim() !== "" || (filters.priority !== undefined && filters.priority !== "none")

export const orderedColumns = (state: BoardState): ReadonlyArray<BoardColumn> => state.columns

export const ticketsInColumn = (state: BoardState, columnId: string): ReadonlyArray<BoardTicket> =>
  state.tickets
    .filter((ticket) => ticket.columnId === columnId)
    .toSorted((left, right) => left.position - right.position)

export const visibleTickets = (
  state: BoardState,
  columnId: string,
  filters: BoardFilters,
): ReadonlyArray<BoardTicket> => {
  const normalizedQuery = filters.query.trim().toLocaleLowerCase("en")

  return ticketsInColumn(state, columnId).filter((ticket) => {
    const queryMatches =
      normalizedQuery === "" ||
      `${ticket.title} ${ticket.description}`.toLocaleLowerCase("en").includes(normalizedQuery)
    const priorityMatches =
      filters.priority === undefined ||
      filters.priority === "none" ||
      ticket.priority === filters.priority

    return queryMatches && priorityMatches
  })
}

export const dependenciesForTicket = (
  state: Pick<BoardState, "ticketDependencies">,
  ticketId: string,
): ReadonlyArray<string> =>
  state.ticketDependencies
    .filter((dependency) => dependency.ticketId === ticketId)
    .map((dependency) => dependency.dependsOnTicketId)

export const dependentsForTicket = (
  state: Pick<BoardState, "ticketDependencies">,
  ticketId: string,
): ReadonlyArray<string> =>
  state.ticketDependencies
    .filter((dependency) => dependency.dependsOnTicketId === ticketId)
    .map((dependency) => dependency.ticketId)

export const openDependencyTitles = (state: BoardState, ticketId: string): ReadonlyArray<string> =>
  dependenciesForTicket(state, ticketId).flatMap((dependsOnTicketId) => {
    const prerequisite = state.tickets.find((ticket) => ticket.id === dependsOnTicketId)
    const column = state.columns.find((candidate) => candidate.id === prerequisite?.columnId)
    return prerequisite !== undefined && column?.done !== true ? [prerequisite.title] : []
  })

const dependencyPathReaches = (
  dependencies: ReadonlyArray<BoardTicketDependency>,
  fromTicketId: string,
  targetTicketId: string,
): boolean => {
  const pending = [fromTicketId]
  const visited = new Set<string>()

  while (pending.length > 0) {
    const current = pending.pop()
    if (current === undefined || visited.has(current)) {
      continue
    }
    if (current === targetTicketId) {
      return true
    }
    visited.add(current)
    for (const dependency of dependencies) {
      if (dependency.ticketId === current) {
        pending.push(dependency.dependsOnTicketId)
      }
    }
  }

  return false
}

export const ticketDependencyIssue = (
  state: Pick<BoardState, "ticketDependencies">,
  ticketId: string,
  dependsOnTicketId: string,
): TicketDependencyIssue | undefined => {
  if (ticketId === dependsOnTicketId) {
    return "self"
  }
  if (
    state.ticketDependencies.some(
      (dependency) =>
        dependency.ticketId === ticketId && dependency.dependsOnTicketId === dependsOnTicketId,
    )
  ) {
    return "duplicate"
  }
  return dependencyPathReaches(state.ticketDependencies, dependsOnTicketId, ticketId)
    ? "cycle"
    : undefined
}

const reindexColumn = (
  tickets: ReadonlyArray<BoardTicket>,
  columnId: string,
): ReadonlyArray<BoardTicket> => {
  let position = 0
  return tickets.map((ticket) => {
    if (ticket.columnId !== columnId) {
      return ticket
    }
    const next = { ...ticket, position }
    position += 1
    return next
  })
}

const sameTicketOrder = (
  left: ReadonlyArray<Pick<BoardTicket, "id">>,
  right: ReadonlyArray<Pick<BoardTicket, "id">>,
): boolean =>
  left.length === right.length && left.every((ticket, index) => ticket.id === right[index]?.id)

export const destinationIndexAfterDrop = (input: {
  readonly destinationTickets: ReadonlyArray<Pick<BoardTicket, "id">>
  readonly draggedTicketId: string
  readonly overTicketId: string | undefined
  readonly insertAfter: boolean
}): number => {
  const withoutDragged = input.destinationTickets.filter(
    (ticket) => ticket.id !== input.draggedTicketId,
  )
  const draggedInDestination = withoutDragged.length !== input.destinationTickets.length

  if (input.overTicketId === undefined) {
    return withoutDragged.length
  }

  if (input.overTicketId === input.draggedTicketId) {
    const currentIndex = input.destinationTickets.findIndex(
      (ticket) => ticket.id === input.draggedTicketId,
    )
    return currentIndex < 0 ? withoutDragged.length : currentIndex
  }

  const overIndex = input.destinationTickets.findIndex((ticket) => ticket.id === input.overTicketId)
  if (overIndex < 0) {
    return withoutDragged.length
  }

  if (draggedInDestination) {
    return Math.min(overIndex, withoutDragged.length)
  }

  return input.insertAfter ? overIndex + 1 : overIndex
}

export const placeTicketAt = (
  state: BoardState,
  ticketId: string,
  destinationColumnId: string,
  destinationIndex: number,
): BoardState => {
  const ticket = state.tickets.find((candidate) => candidate.id === ticketId)
  const destination = state.columns.find((column) => column.id === destinationColumnId)
  if (ticket === undefined || destination === undefined) {
    return state
  }

  const withoutTicket = state.tickets.filter((candidate) => candidate.id !== ticketId)
  const destinationTickets = withoutTicket
    .filter((candidate) => candidate.columnId === destinationColumnId)
    .toSorted((left, right) => left.position - right.position)
  const insertionIndex = Math.min(Math.max(destinationIndex, 0), destinationTickets.length)
  const movedTicket: BoardTicket = {
    ...ticket,
    columnId: destinationColumnId,
    position: insertionIndex,
  }
  const orderedDestination = destinationTickets.toSpliced(insertionIndex, 0, movedTicket)

  if (
    ticket.columnId === destinationColumnId &&
    sameTicketOrder(ticketsInColumn(state, destinationColumnId), orderedDestination)
  ) {
    return state
  }

  const destinationIds = new Set(orderedDestination.map((candidate) => candidate.id))
  const untouched = withoutTicket.filter((candidate) => !destinationIds.has(candidate.id))
  let nextTickets: ReadonlyArray<BoardTicket> = [
    ...untouched,
    ...orderedDestination.map((candidate, position) => Object.assign({}, candidate, { position })),
  ]
  nextTickets = reindexColumn(nextTickets, ticket.columnId)

  return { ...state, tickets: nextTickets }
}

export const applyTicketDrop = (
  state: BoardState,
  ticketId: string,
  destinationColumnId: string,
  overTicketId: string | undefined,
  insertAfter: boolean,
): BoardState => {
  const destinationIndex = destinationIndexAfterDrop({
    destinationTickets: ticketsInColumn(state, destinationColumnId),
    draggedTicketId: ticketId,
    overTicketId,
    insertAfter,
  })
  return placeTicketAt(state, ticketId, destinationColumnId, destinationIndex)
}

export const moveTicket = (
  state: BoardState,
  ticketId: string,
  destinationColumnId: string,
  beforeTicketId?: string,
): BoardState => {
  const ticket = state.tickets.find((candidate) => candidate.id === ticketId)
  const destination = state.columns.find((column) => column.id === destinationColumnId)
  if (ticket === undefined || destination === undefined) {
    return state
  }

  const destinationTickets = ticketsInColumn(state, destinationColumnId).filter(
    (candidate) => candidate.id !== ticketId,
  )
  const requestedIndex =
    beforeTicketId === undefined
      ? destinationTickets.length
      : destinationTickets.findIndex((candidate) => candidate.id === beforeTicketId)
  const insertionIndex = requestedIndex < 0 ? destinationTickets.length : requestedIndex
  return placeTicketAt(state, ticketId, destinationColumnId, insertionIndex)
}

export const reorderTicket = (
  state: BoardState,
  ticketId: string,
  direction: -1 | 1,
): BoardState => {
  const ticket = state.tickets.find((candidate) => candidate.id === ticketId)
  if (ticket === undefined) {
    return state
  }

  const siblings = ticketsInColumn(state, ticket.columnId)
  const currentIndex = siblings.findIndex((candidate) => candidate.id === ticketId)
  const nextIndex = Math.min(Math.max(currentIndex + direction, 0), siblings.length - 1)
  if (currentIndex === nextIndex) {
    return state
  }

  const reordered = siblings.toSpliced(currentIndex, 1).toSpliced(nextIndex, 0, ticket)
  const positions = new Map(reordered.map((candidate, position) => [candidate.id, position]))
  return {
    ...state,
    tickets: state.tickets.map((candidate) => ({
      ...candidate,
      position: positions.get(candidate.id) ?? candidate.position,
    })),
  }
}

export const moveTicketToAdjacentColumn = (
  state: BoardState,
  ticketId: string,
  direction: -1 | 1,
): BoardState => {
  const ticket = state.tickets.find((candidate) => candidate.id === ticketId)
  if (ticket === undefined) {
    return state
  }
  const currentIndex = state.columns.findIndex((column) => column.id === ticket.columnId)
  const destination = state.columns[currentIndex + direction]
  return destination === undefined ? state : moveTicket(state, ticketId, destination.id)
}

export const createTicket = (
  state: BoardState,
  input: { readonly id: string; readonly columnId: string; readonly title: string },
): BoardState => {
  const column = state.columns.find((candidate) => candidate.id === input.columnId)
  if (column === undefined || column.done || input.title.trim() === "") {
    return state
  }
  const ticket: BoardTicket = {
    id: input.id,
    columnId: input.columnId,
    position: ticketsInColumn(state, input.columnId).length,
    title: input.title.trim(),
    description: "",
    priority: "normal",
  }
  return { ...state, tickets: [...state.tickets, ticket] }
}

export const updateTicket = (
  state: BoardState,
  ticketId: string,
  patch: BoardTicketPatch,
): BoardState => ({
  ...state,
  tickets: state.tickets.map((ticket) => {
    if (ticket.id !== ticketId) {
      return ticket
    }
    const next = Object.assign({}, ticket, patch)
    if (patch.dueAt === undefined && "dueAt" in patch) {
      Reflect.deleteProperty(next, "dueAt")
    }
    return next
  }),
})

export const addColumn = (state: BoardState, name: string, id: string): BoardState => {
  if (name.trim() === "") {
    return state
  }
  const doneIndex = state.columns.findIndex((column) => column.done)
  const insertionIndex = doneIndex < 0 ? state.columns.length : doneIndex
  const column: BoardColumn = {
    id,
    name: name.trim(),
    color: "#a3a3a3",
    done: false,
  }
  return { ...state, columns: state.columns.toSpliced(insertionIndex, 0, column) }
}
