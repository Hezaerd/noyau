import type { TicketPriority } from "@noyau/protocol/entities/ticket"

export interface BoardColumn {
  readonly id: string
  readonly name: string
  readonly color: string
  readonly done: boolean
}

export interface BoardActor {
  readonly id: string
  readonly name: string
  readonly initials: string
  readonly role: string
  readonly kind: "human" | "agent"
  readonly profileId?: string
}

export type TicketAttention = "blocked" | "question" | "approval" | "failure"
export type ExecutionAttention = "running" | "waiting" | "verifying" | "failed"

export interface BoardExecutionSummary {
  readonly count: number
  readonly profiles: ReadonlyArray<string>
  readonly status: ExecutionAttention
}

export interface BoardActivity {
  readonly id: string
  readonly actor: string
  readonly action: string
  readonly at: string
}

export interface BoardMessage {
  readonly id: string
  readonly actor: string
  readonly initials: string
  readonly body: string
  readonly at: string
  readonly own?: boolean
}

export interface BoardTicket {
  readonly id: string
  readonly columnId: string
  readonly position: number
  readonly title: string
  readonly description: string
  readonly priority: TicketPriority
  readonly dueAt?: string
  readonly assigneeId?: string
  readonly labels: ReadonlyArray<string>
  readonly checklist: ReadonlyArray<{
    readonly id: string
    readonly title: string
    readonly done: boolean
  }>
  readonly attention?: TicketAttention
  readonly execution?: BoardExecutionSummary
  readonly blockedBy: ReadonlyArray<string>
  readonly messages: ReadonlyArray<BoardMessage>
  readonly activity: ReadonlyArray<BoardActivity>
}

export interface BoardState {
  readonly columns: ReadonlyArray<BoardColumn>
  readonly tickets: ReadonlyArray<BoardTicket>
  readonly actors: ReadonlyArray<BoardActor>
}

export interface BoardFilters {
  readonly query: string
  readonly assignee?: string
  readonly priority?: TicketPriority
}

export interface BoardSearch {
  readonly ticket?: string
  readonly q?: string
  readonly assignee?: string
  readonly priority?: TicketPriority
}

export interface BoardSearchPatch {
  readonly ticket?: string | undefined
  readonly q?: string | undefined
  readonly assignee?: string | undefined
  readonly priority?: TicketPriority | undefined
}

export interface BoardTicketPatch {
  readonly title?: string
  readonly description?: string
  readonly priority?: TicketPriority
  readonly dueAt?: string | undefined
  readonly assigneeId?: string | undefined
}

export const priorities = ["none", "low", "normal", "high", "urgent"] as const
export const isTicketPriority = (value: string): value is TicketPriority =>
  priorities.some((priority) => priority === value)

const asOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value : undefined

export const parseBoardSearch = (search: Record<string, unknown>): BoardSearch => {
  const ticket = asOptionalString(search.ticket)
  const query = asOptionalString(search.q)
  const assignee = asOptionalString(search.assignee)
  const priority = asOptionalString(search.priority)

  return {
    ...(ticket === undefined ? {} : { ticket }),
    ...(query === undefined ? {} : { q: query }),
    ...(assignee === undefined ? {} : { assignee }),
    ...(priority !== undefined && isTicketPriority(priority) ? { priority } : {}),
  }
}

export const isFiltered = (filters: BoardFilters): boolean =>
  filters.query.trim() !== "" ||
  filters.assignee !== undefined ||
  (filters.priority !== undefined && filters.priority !== "none")

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
      `${ticket.title} ${ticket.description} ${ticket.labels.join(" ")}`
        .toLocaleLowerCase("fr")
        .includes(normalizedQuery)
    const assigneeMatches = filters.assignee === undefined || ticket.assigneeId === filters.assignee
    const priorityMatches =
      filters.priority === undefined ||
      filters.priority === "none" ||
      ticket.priority === filters.priority

    return queryMatches && assigneeMatches && priorityMatches
  })
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

  return {
    ...state,
    tickets: nextTickets.map((candidate) => {
      if (candidate.id !== ticketId || !destination.done) {
        return candidate
      }
      const withoutAttention = Object.assign({}, candidate)
      Reflect.deleteProperty(withoutAttention, "attention")
      return withoutAttention
    }),
  }
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
    labels: [],
    checklist: [],
    blockedBy: [],
    messages: [],
    activity: [
      {
        id: `${input.id}-created`,
        actor: "Hezaerd",
        action: "a créé le ticket",
        at: "À l’instant",
      },
    ],
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
    const next = Object.assign({}, ticket, patch, {
      activity: [
        {
          id: `${ticketId}-${ticket.activity.length}`,
          actor: "Hezaerd",
          action: "a mis à jour les détails",
          at: "À l’instant",
        },
        ...ticket.activity,
      ],
    })
    if (patch.dueAt === undefined && "dueAt" in patch) {
      Reflect.deleteProperty(next, "dueAt")
    }
    if (patch.assigneeId === undefined && "assigneeId" in patch) {
      Reflect.deleteProperty(next, "assigneeId")
    }
    return next
  }),
})

export const toggleChecklistItem = (
  state: BoardState,
  ticketId: string,
  checklistItemId: string,
): BoardState => ({
  ...state,
  tickets: state.tickets.map((ticket) =>
    ticket.id === ticketId
      ? {
          ...ticket,
          checklist: ticket.checklist.map((item) =>
            item.id === checklistItemId ? { ...item, done: !item.done } : item,
          ),
        }
      : ticket,
  ),
})

export const startExecution = (
  state: BoardState,
  ticketId: string,
  profile: string,
): BoardState => ({
  ...state,
  tickets: state.tickets.map((ticket) =>
    ticket.id === ticketId
      ? {
          ...ticket,
          execution: {
            count: (ticket.execution?.count ?? 0) + 1,
            profiles: [...new Set([...(ticket.execution?.profiles ?? []), profile])],
            status: "running" as const,
          },
          activity: [
            {
              id: `${ticketId}-execution-${ticket.activity.length}`,
              actor: "Hezaerd",
              action: `a lancé une exécution avec ${profile}`,
              at: "À l’instant",
            },
            ...ticket.activity,
          ],
        }
      : ticket,
  ),
})

export const appendWorkbenchMessage = (
  state: BoardState,
  ticketId: string,
  body: string,
): BoardState => {
  const message = body.trim()
  if (message === "") {
    return state
  }
  return {
    ...state,
    tickets: state.tickets.map((ticket) =>
      ticket.id === ticketId
        ? {
            ...ticket,
            messages: [
              ...ticket.messages,
              {
                id: `${ticketId}-message-${ticket.messages.length}`,
                actor: "Hezaerd",
                initials: "HZ",
                body: message,
                at: "Maintenant",
                own: true,
              },
            ],
          }
        : ticket,
    ),
  }
}

export const addColumn = (state: BoardState, name: string, id: string): BoardState => {
  if (name.trim() === "") {
    return state
  }
  const doneIndex = state.columns.findIndex((column) => column.done)
  const insertionIndex = doneIndex < 0 ? state.columns.length : doneIndex
  const column: BoardColumn = {
    id,
    name: name.trim(),
    color: "#A855F7",
    done: false,
  }
  return { ...state, columns: state.columns.toSpliced(insertionIndex, 0, column) }
}

export const boardActors: ReadonlyArray<BoardActor> = [
  { id: "human:hezaerd", name: "Hezaerd", initials: "HZ", role: "Propriétaire", kind: "human" },
  {
    id: "agent:marion",
    name: "Marion",
    initials: "MA",
    role: "Orchestration",
    kind: "agent",
    profileId: "71000000-0000-4000-8000-000000000001",
  },
  {
    id: "agent:claude",
    name: "Claude",
    initials: "CL",
    role: "Développement",
    kind: "agent",
    profileId: "71000000-0000-4000-8000-000000000002",
  },
  {
    id: "agent:reviewer",
    name: "Reviewer",
    initials: "RV",
    role: "Revue",
    kind: "agent",
    profileId: "71000000-0000-4000-8000-000000000003",
  },
]

export const initialBoardState: BoardState = {
  actors: boardActors,
  columns: [
    { id: "column-backlog", name: "Backlog", color: "#6D5BD0", done: false },
    { id: "column-active", name: "En cours", color: "#3B82F6", done: false },
    { id: "column-done", name: "Done", color: "#10B981", done: true },
  ],
  tickets: [
    {
      id: "ticket-projection",
      columnId: "column-backlog",
      position: 0,
      title: "Brancher le snapshot Tableau sur la projection PostgreSQL",
      description:
        "Exposer une lecture compacte des colonnes et tickets, puis reprendre le flux depuis son curseur opaque.",
      priority: "urgent",
      dueAt: "2026-08-16T17:00:00.000Z",
      assigneeId: "human:hezaerd",
      labels: ["server", "projection"],
      checklist: [
        { id: "check-1", title: "Lire la projection", done: true },
        { id: "check-2", title: "Décoder le snapshot", done: false },
        { id: "check-3", title: "Reprendre le flux", done: false },
      ],
      blockedBy: ["ticket-http"],
      attention: "blocked",
      messages: [
        {
          id: "message-1",
          actor: "Marion",
          initials: "MA",
          body: "La projection est prête. Il reste à stabiliser la frontière de lecture.",
          at: "00:42",
        },
      ],
      activity: [
        {
          id: "activity-1",
          actor: "Marion",
          action: "a ajouté une dépendance",
          at: "Il y a 32 min",
        },
        { id: "activity-2", actor: "Hezaerd", action: "a défini la priorité urgente", at: "Hier" },
      ],
    },
    {
      id: "ticket-http",
      columnId: "column-backlog",
      position: 1,
      title: "Définir la frontière RPC du Tableau",
      description:
        "Ajouter les commandes Ticket et la lecture BoardSnapshot à la frontière serveur.",
      priority: "high",
      assigneeId: "agent:marion",
      labels: ["protocol", "rpc"],
      checklist: [],
      attention: "approval",
      blockedBy: [],
      messages: [],
      activity: [
        {
          id: "activity-3",
          actor: "Marion",
          action: "a demandé une approbation",
          at: "Il y a 1 h",
        },
      ],
    },
    {
      id: "ticket-sheet",
      columnId: "column-backlog",
      position: 2,
      title: "Rendre le Sheet Ticket partageable",
      description:
        "Conserver le ticket, la recherche et les filtres dans l’URL sans détourner l’historique natif.",
      priority: "normal",
      dueAt: "2026-08-20T17:00:00.000Z",
      labels: ["web", "a11y"],
      checklist: [],
      blockedBy: [],
      messages: [],
      activity: [],
    },
    {
      id: "ticket-board-ui",
      columnId: "column-active",
      position: 0,
      title: "Construire l’interface du Tableau",
      description:
        "Colonnes stables, interactions rapides et information progressive pour superviser le projet.",
      priority: "high",
      assigneeId: "agent:claude",
      labels: ["web", "design"],
      checklist: [
        { id: "check-4", title: "Colonnes et cartes", done: true },
        { id: "check-5", title: "Navigation clavier", done: true },
        { id: "check-6", title: "Sheet Ticket", done: false },
        { id: "check-7", title: "Palette", done: false },
      ],
      execution: { count: 1, profiles: ["Claude"], status: "running" },
      blockedBy: [],
      messages: [
        {
          id: "message-2",
          actor: "Claude",
          initials: "CL",
          body: "La structure du Tableau est en place. Je finalise les interactions clavier.",
          at: "01:07",
        },
        {
          id: "message-3",
          actor: "Hezaerd",
          initials: "HZ",
          body: "Garde les cartes compactes, le détail peut vivre dans le Sheet.",
          at: "01:11",
          own: true,
        },
      ],
      activity: [
        {
          id: "activity-4",
          actor: "Claude",
          action: "a démarré une exécution",
          at: "Il y a 24 min",
        },
      ],
    },
    {
      id: "ticket-reconciliation",
      columnId: "column-active",
      position: 1,
      title: "Rejouer les commandes optimistes après reconnexion",
      description:
        "Préserver M2 quand une projection confirme ou rejette M1, puis recalculer l’état affiché.",
      priority: "urgent",
      assigneeId: "agent:reviewer",
      labels: ["realtime", "tests"],
      checklist: [
        { id: "check-8", title: "File ordonnée", done: true },
        { id: "check-9", title: "Rebase sur snapshot", done: false },
      ],
      attention: "question",
      execution: { count: 2, profiles: ["Reviewer", "Claude"], status: "waiting" },
      blockedBy: [],
      messages: [],
      activity: [],
    },
    {
      id: "ticket-adr",
      columnId: "column-done",
      position: 0,
      title: "Séparer Ticket et Execution dans le modèle",
      description:
        "Le Ticket porte le travail durable ; Execution, Attempt et AgentRun décrivent sa réalisation.",
      priority: "normal",
      assigneeId: "human:hezaerd",
      labels: ["adr", "domain"],
      checklist: [{ id: "check-10", title: "ADR acceptée", done: true }],
      blockedBy: [],
      messages: [],
      activity: [
        {
          id: "activity-5",
          actor: "Hezaerd",
          action: "a clôturé le ticket",
          at: "Aujourd’hui, 01:13",
        },
      ],
    },
    {
      id: "ticket-migrations",
      columnId: "column-done",
      position: 1,
      title: "Créer les projections SQL du Tableau",
      description: "Colonnes, tickets, dépendances et exécutions disposent de contraintes testées.",
      priority: "high",
      assigneeId: "agent:claude",
      labels: ["database"],
      checklist: [
        { id: "check-11", title: "Migration", done: true },
        { id: "check-12", title: "Contraintes", done: true },
      ],
      blockedBy: [],
      messages: [],
      activity: [],
    },
  ],
}
