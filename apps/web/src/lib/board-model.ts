import type { TicketPriority } from "@noyau/protocol/entities/ticket"
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
  const normalizedQuery = filters.query.trim().toLocaleLowerCase("fr")

  return ticketsInColumn(state, columnId).filter((ticket) => {
    const queryMatches =
      normalizedQuery === "" ||
      `${ticket.title} ${ticket.description}`.toLocaleLowerCase("fr").includes(normalizedQuery)
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

  const withoutTicket = state.tickets.filter((candidate) => candidate.id !== ticketId)
  const destinationTickets = withoutTicket
    .filter((candidate) => candidate.columnId === destinationColumnId)
    .toSorted((left, right) => left.position - right.position)
  const requestedIndex =
    beforeTicketId === undefined
      ? destinationTickets.length
      : destinationTickets.findIndex((candidate) => candidate.id === beforeTicketId)
  const insertionIndex = requestedIndex < 0 ? destinationTickets.length : requestedIndex
  const movedTicket: BoardTicket = {
    ...ticket,
    columnId: destinationColumnId,
    position: insertionIndex,
  }
  const orderedDestination = destinationTickets.toSpliced(insertionIndex, 0, movedTicket)
  const destinationIds = new Set(orderedDestination.map((candidate) => candidate.id))
  const untouched = withoutTicket.filter((candidate) => !destinationIds.has(candidate.id))
  let nextTickets: ReadonlyArray<BoardTicket> = [
    ...untouched,
    ...orderedDestination.map((candidate, position) => Object.assign({}, candidate, { position })),
  ]
  nextTickets = reindexColumn(nextTickets, ticket.columnId)

  return { ...state, tickets: nextTickets }
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

export const initialBoardState: BoardState = {
  columns: [
    { id: "column-backlog", name: "Backlog", color: "#a3a3a3", done: false },
    { id: "column-active", name: "En cours", color: "#3B82F6", done: false },
    { id: "column-done", name: "Done", color: "#10B981", done: true },
  ],
  tickets: [
    {
      id: "ticket-projection",
      columnId: "column-backlog",
      position: 0,
      title: "Brancher le snapshot Tableau sur la projection PostgreSQL",
      description: "Exposer une lecture compacte des colonnes et tickets.",
      priority: "urgent",
      dueAt: "2026-08-16T17:00:00.000Z",
    },
    {
      id: "ticket-http",
      columnId: "column-backlog",
      position: 1,
      title: "Définir la frontière RPC du Tableau",
      description: "Ajouter les commandes Ticket et la lecture BoardSnapshot.",
      priority: "high",
    },
    {
      id: "ticket-sheet",
      columnId: "column-backlog",
      position: 2,
      title: "Rendre le Dialog Ticket partageable",
      description: "Conserver le ticket et la recherche dans l’URL.",
      priority: "normal",
      dueAt: "2026-08-20T17:00:00.000Z",
    },
    {
      id: "ticket-board-ui",
      columnId: "column-active",
      position: 0,
      title: "Construire l’interface du Tableau",
      description: "Colonnes stables, interactions rapides et information progressive.",
      priority: "high",
    },
    {
      id: "ticket-reconciliation",
      columnId: "column-active",
      position: 1,
      title: "Rejouer les commandes optimistes après reconnexion",
      description: "Préserver les commandes concurrentes pendant la réconciliation.",
      priority: "urgent",
    },
  ],
  ticketDependencies: [{ ticketId: "ticket-projection", dependsOnTicketId: "ticket-http" }],
}
