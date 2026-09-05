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

type GroupKey = `${BoardActionSurface}:${string}`

type MutableActionGroup = {
  readonly id: string
  label: string
  readonly actions: Array<ExecutableBoardAction>
}

type ActionGroupIndex = ReadonlyMap<GroupKey, ReadonlyArray<BoardActionGroup>>

const EMPTY_ACTION_GROUPS: ReadonlyArray<BoardActionGroup> = []
/** Action lists are immutable for their lifetime and recreated by createBoardActions per render. */
const actionGroupIndexes = new WeakMap<ReadonlyArray<ExecutableBoardAction>, ActionGroupIndex>()

const targetKey = (target: BoardActionTarget): string =>
  target.kind === "board" ? target.kind : `${target.kind}:${target.id}`

const groupKey = (surface: BoardActionSurface, target: string): GroupKey => `${surface}:${target}`

const appendToGroup = (
  groups: Map<string, MutableActionGroup>,
  action: ExecutableBoardAction,
): void => {
  const current = groups.get(action.groupId)
  if (current === undefined) {
    groups.set(action.groupId, {
      id: action.groupId,
      label: action.groupLabel,
      actions: [action],
    })
    return
  }
  current.label = action.groupLabel
  current.actions.push(action)
}

const indexBoardActions = (actions: ReadonlyArray<ExecutableBoardAction>): ActionGroupIndex => {
  const grouped = new Map<GroupKey, Map<string, MutableActionGroup>>()

  for (const action of actions) {
    const surfaces = new Set(action.surfaces)
    for (const surface of surfaces) {
      if (surface === "context-menu") {
        if (action.target === undefined) {
          continue
        }
        const targetGroupsKey = groupKey(surface, targetKey(action.target))
        const targetGroups = grouped.get(targetGroupsKey) ?? new Map<string, MutableActionGroup>()
        grouped.set(targetGroupsKey, targetGroups)
        appendToGroup(targetGroups, action)
        continue
      }

      const surfaceGroups =
        grouped.get(groupKey(surface, "*")) ?? new Map<string, MutableActionGroup>()
      grouped.set(groupKey(surface, "*"), surfaceGroups)
      appendToGroup(surfaceGroups, action)
    }
  }

  return new Map(
    [...grouped].map(([key, groups]) => [
      key,
      [...groups.values()].map((group) => ({
        id: group.id,
        label: group.label,
        actions: group.actions,
      })),
    ]),
  )
}

const actionGroupIndexFor = (actions: ReadonlyArray<ExecutableBoardAction>): ActionGroupIndex => {
  const cached = actionGroupIndexes.get(actions)
  if (cached !== undefined) {
    return cached
  }
  const index = indexBoardActions(actions)
  actionGroupIndexes.set(actions, index)
  return index
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
  if (surface === "context-menu" && target === undefined) {
    return EMPTY_ACTION_GROUPS
  }
  const key = groupKey(
    surface,
    surface === "context-menu" && target !== undefined ? targetKey(target) : "*",
  )
  return actionGroupIndexFor(actions).get(key) ?? EMPTY_ACTION_GROUPS
}
