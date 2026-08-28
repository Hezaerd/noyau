import type { TicketPriority } from "@noyau/contracts/entities/ticket"

import type { BoardState } from "@/lib/board-model"
import { resolveKeybindings, type ResolvedKeybindings } from "@/lib/keybindings"

export type BoardActionSurface = "context-menu" | "palette"

export type BoardActionTarget =
  | { readonly kind: "board" }
  | { readonly kind: "column"; readonly id: string }
  | { readonly kind: "ticket"; readonly id: string }

export type BoardActionAppearance =
  | { readonly kind: "create" }
  | { readonly kind: "search" }
  | { readonly kind: "ticket"; readonly priority: TicketPriority }
  | { readonly kind: "rename" }
  | { readonly kind: "archive" }
  | { readonly kind: "delete" }

export interface ExecutableBoardAction {
  readonly id: string
  readonly label: string
  readonly searchValue: string
  readonly groupId: string
  readonly groupLabel: string
  readonly shortcut?: string
  readonly disabled?: boolean
  readonly destructive?: boolean
  readonly surfaces: ReadonlyArray<BoardActionSurface>
  readonly target?: BoardActionTarget
  readonly appearance: BoardActionAppearance
  readonly execute: () => void | Promise<void>
}

export interface BoardActionGroup {
  readonly id: string
  readonly label: string
  readonly actions: ReadonlyArray<ExecutableBoardAction>
}

export interface BoardActions {
  readonly createTicket: () => void
  readonly focusSearch: () => void
  readonly deleteColumn: (columnId: string) => void | Promise<void>
  readonly openTicket: (ticketId: string) => void
  readonly renameColumn: (columnId: string) => void
  readonly renameTicket: (ticketId: string) => void
  readonly archiveTicket: (ticketId: string) => void
}

const targetsMatch = (
  actionTarget: BoardActionTarget | undefined,
  requestedTarget: BoardActionTarget,
): boolean => {
  if (actionTarget === undefined || actionTarget.kind !== requestedTarget.kind) {
    return false
  }
  switch (requestedTarget.kind) {
    case "board":
      return true
    case "column":
      return actionTarget.kind === "column" && actionTarget.id === requestedTarget.id
    case "ticket":
      return actionTarget.kind === "ticket" && actionTarget.id === requestedTarget.id
  }
}

export const createBoardActions = (
  state: BoardState,
  actions: BoardActions,
  keybindings: ResolvedKeybindings = resolveKeybindings(),
): ReadonlyArray<ExecutableBoardAction> => [
  {
    id: "ticket.create",
    label: "Create a ticket",
    searchValue: "Create a ticket",
    groupId: "actions",
    groupLabel: "Actions",
    shortcut: keybindings["board.ticket.create"],
    surfaces: ["palette"],
    appearance: { kind: "create" },
    execute: actions.createTicket,
  },
  {
    id: "board.search",
    label: "Search",
    searchValue: "Search",
    groupId: "actions",
    groupLabel: "Actions",
    shortcut: keybindings["board.search"],
    surfaces: ["palette"],
    appearance: { kind: "search" },
    execute: actions.focusSearch,
  },
  ...state.tickets.flatMap((ticket): ReadonlyArray<ExecutableBoardAction> => [
    {
      id: `ticket.open.${ticket.id}`,
      label: "Open",
      searchValue: `Open ${ticket.title}`,
      groupId: "tickets",
      groupLabel: "Tickets",
      surfaces: ["context-menu"],
      target: { kind: "ticket", id: ticket.id },
      appearance: { kind: "ticket", priority: ticket.priority },
      execute: () => actions.openTicket(ticket.id),
    },
    {
      id: `ticket.rename.${ticket.id}`,
      label: "Rename",
      searchValue: `Rename ${ticket.title}`,
      groupId: "tickets",
      groupLabel: "Tickets",
      shortcut: keybindings["board.ticket.rename"],
      surfaces: ["context-menu"],
      target: { kind: "ticket", id: ticket.id },
      appearance: { kind: "rename" },
      execute: () => actions.renameTicket(ticket.id),
    },
    {
      id: `ticket.archive.${ticket.id}`,
      label: "Archive",
      searchValue: `Archive ${ticket.title}`,
      groupId: "tickets",
      groupLabel: "Tickets",
      destructive: true,
      surfaces: ["context-menu"],
      target: { kind: "ticket", id: ticket.id },
      appearance: { kind: "archive" },
      execute: () => actions.archiveTicket(ticket.id),
    },
  ]),
  ...state.columns.flatMap((column): ReadonlyArray<ExecutableBoardAction> => [
    {
      id: `column.rename.${column.id}`,
      label: "Rename",
      searchValue: `Rename column ${column.name}`,
      groupId: "columns",
      groupLabel: "Columns",
      shortcut: keybindings["board.column.rename"],
      surfaces: ["context-menu"],
      target: { kind: "column", id: column.id },
      appearance: { kind: "rename" },
      execute: () => actions.renameColumn(column.id),
    },
    ...(!column.done
      ? [
          {
            id: `column.delete.${column.id}`,
            label: "Delete",
            searchValue: `Delete column ${column.name}`,
            groupId: "columns",
            groupLabel: "Columns",
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

export const groupBoardActions = (
  actions: ReadonlyArray<ExecutableBoardAction>,
  surface: BoardActionSurface,
  target?: BoardActionTarget,
): ReadonlyArray<BoardActionGroup> => {
  const groups = new Map<string, BoardActionGroup>()

  for (const action of actions) {
    if (!action.surfaces.includes(surface)) {
      continue
    }
    if (
      surface === "context-menu" &&
      (target === undefined || !targetsMatch(action.target, target))
    ) {
      continue
    }
    const group = groups.get(action.groupId)
    groups.set(action.groupId, {
      id: action.groupId,
      label: action.groupLabel,
      actions: [...(group?.actions ?? []), action],
    })
  }

  return [...groups.values()]
}
