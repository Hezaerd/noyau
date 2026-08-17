import type { TicketPriority } from "@noyau/protocol/entities/ticket"

import type { BoardState } from "@/lib/board-model"

export type BoardCommandSurface = "context-menu" | "palette"

export type BoardCommandTarget =
  | { readonly kind: "board" }
  | { readonly kind: "column"; readonly id: string }
  | { readonly kind: "ticket"; readonly id: string }

export type BoardCommandAppearance =
  | { readonly kind: "create" }
  | { readonly kind: "search" }
  | { readonly kind: "column"; readonly color: string }
  | { readonly kind: "ticket"; readonly priority: TicketPriority }
  | { readonly kind: "rename" }
  | { readonly kind: "delete" }

export interface ExecutableBoardCommand {
  readonly id: string
  readonly label: string
  readonly paletteLabel?: string
  readonly searchValue: string
  readonly groupId: string
  readonly groupLabel: string
  readonly shortcut?: string
  readonly disabled?: boolean
  readonly destructive?: boolean
  readonly surfaces: ReadonlyArray<BoardCommandSurface>
  readonly target?: BoardCommandTarget
  readonly appearance: BoardCommandAppearance
  readonly execute: () => void | Promise<void>
}

export interface BoardCommandGroup {
  readonly id: string
  readonly label: string
  readonly commands: ReadonlyArray<ExecutableBoardCommand>
}

export interface BoardCommandActions {
  readonly createTicket: () => void
  readonly focusSearch: () => void
  readonly deleteColumn: (columnId: string) => void | Promise<void>
  readonly moveTicket: (ticketId: string, columnId: string) => void | Promise<void>
  readonly openTicket: (ticketId: string) => void
  readonly renameColumn: (columnId: string) => void
  readonly renameTicket: (ticketId: string) => void
}

const targetsMatch = (
  commandTarget: BoardCommandTarget | undefined,
  requestedTarget: BoardCommandTarget,
): boolean => {
  if (commandTarget === undefined || commandTarget.kind !== requestedTarget.kind) {
    return false
  }
  switch (requestedTarget.kind) {
    case "board":
      return true
    case "column":
      return commandTarget.kind === "column" && commandTarget.id === requestedTarget.id
    case "ticket":
      return commandTarget.kind === "ticket" && commandTarget.id === requestedTarget.id
  }
}

export const createBoardCommands = (
  state: BoardState,
  activeTicketId: string | undefined,
  actions: BoardCommandActions,
): ReadonlyArray<ExecutableBoardCommand> => [
  {
    id: "ticket.create",
    label: "Créer un ticket",
    searchValue: "Créer un ticket",
    groupId: "actions",
    groupLabel: "Commandes",
    shortcut: "C",
    surfaces: ["palette"],
    appearance: { kind: "create" },
    execute: actions.createTicket,
  },
  {
    id: "board.search",
    label: "Rechercher",
    searchValue: "Rechercher",
    groupId: "actions",
    groupLabel: "Commandes",
    shortcut: "/",
    surfaces: ["palette"],
    appearance: { kind: "search" },
    execute: actions.focusSearch,
  },
  ...state.columns.map((column): ExecutableBoardCommand => ({
    id: `ticket.move.${column.id}`,
    label: column.name,
    searchValue: `Déplacer le ticket vers ${column.name}`,
    groupId: "move",
    groupLabel: "Déplacer le ticket actif",
    disabled: activeTicketId === undefined,
    surfaces: ["palette"],
    appearance: { kind: "column", color: column.color },
    execute: () => {
      if (activeTicketId !== undefined) {
        return actions.moveTicket(activeTicketId, column.id)
      }
    },
  })),
  ...state.tickets.flatMap((ticket): ReadonlyArray<ExecutableBoardCommand> => [
    {
      id: `ticket.open.${ticket.id}`,
      label: "Ouvrir",
      paletteLabel: ticket.title,
      searchValue: `${ticket.title} ${ticket.labels.join(" ")}`,
      groupId: "tickets",
      groupLabel: "Tickets",
      surfaces: ["palette", "context-menu"],
      target: { kind: "ticket", id: ticket.id },
      appearance: { kind: "ticket", priority: ticket.priority },
      execute: () => actions.openTicket(ticket.id),
    },
    {
      id: `ticket.rename.${ticket.id}`,
      label: "Renommer",
      searchValue: `Renommer ${ticket.title}`,
      groupId: "tickets",
      groupLabel: "Tickets",
      shortcut: "F2",
      surfaces: ["context-menu"],
      target: { kind: "ticket", id: ticket.id },
      appearance: { kind: "rename" },
      execute: () => actions.renameTicket(ticket.id),
    },
  ]),
  ...state.columns.flatMap((column): ReadonlyArray<ExecutableBoardCommand> => [
    {
      id: `column.rename.${column.id}`,
      label: "Renommer",
      searchValue: `Renommer la colonne ${column.name}`,
      groupId: "columns",
      groupLabel: "Colonnes",
      shortcut: "F2",
      surfaces: ["context-menu"],
      target: { kind: "column", id: column.id },
      appearance: { kind: "rename" },
      execute: () => actions.renameColumn(column.id),
    },
    ...(!column.done
      ? [
          {
            id: `column.delete.${column.id}`,
            label: "Supprimer",
            searchValue: `Supprimer la colonne ${column.name}`,
            groupId: "columns",
            groupLabel: "Colonnes",
            destructive: true,
            surfaces: ["context-menu" as const],
            target: { kind: "column" as const, id: column.id },
            appearance: { kind: "delete" as const },
            execute: () => actions.deleteColumn(column.id),
          },
        ]
      : []),
  ]),
]

export const groupBoardCommands = (
  commands: ReadonlyArray<ExecutableBoardCommand>,
  surface: BoardCommandSurface,
  target?: BoardCommandTarget,
): ReadonlyArray<BoardCommandGroup> => {
  const groups = new Map<string, BoardCommandGroup>()

  for (const command of commands) {
    if (!command.surfaces.includes(surface)) {
      continue
    }
    if (
      surface === "context-menu" &&
      (target === undefined || !targetsMatch(command.target, target))
    ) {
      continue
    }
    const group = groups.get(command.groupId)
    groups.set(command.groupId, {
      id: command.groupId,
      label: command.groupLabel,
      commands: [...(group?.commands ?? []), command],
    })
  }

  return [...groups.values()]
}
