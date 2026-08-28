export const KEYBINDING_GROUP_IDS = ["global", "board", "thread", "settings"] as const

export type KeybindingGroupId = (typeof KEYBINDING_GROUP_IDS)[number]

export const KEYBINDING_IDS = [
  "palette.open",
  "settings.open",
  "thread.create",
  "thread.rename",
  "thread.pin",
  "thread.settle",
  "thread.model-picker.open",
  "board.search",
  "board.ticket.create",
  "board.ticket.open",
  "board.ticket.rename",
  "board.column.rename",
  "board.navigate.up",
  "board.navigate.down",
  "board.navigate.left",
  "board.navigate.right",
  "board.move.up",
  "board.move.down",
  "board.move.left",
  "board.move.right",
  "settings.search",
  "settings.keybindings.search",
] as const

export type KeybindingId = (typeof KEYBINDING_IDS)[number]

export interface KeybindingDefinition {
  readonly id: KeybindingId
  readonly group: KeybindingGroupId
  readonly title: string
  readonly description: string
  readonly defaultHotkey: string
  readonly when?: string
}

export const KEYBINDING_GROUP_LABELS = {
  global: "General",
  board: "Board",
  thread: "Thread",
  settings: "Settings",
} as const satisfies Record<KeybindingGroupId, string>

const WHEN_GLOBAL = "!dialogOpen && !editableFocused"
const WHEN_THREAD = "thread && !dialogOpen"
const WHEN_THREAD_CHROME = "thread && !dialogOpen && !editableFocused"
const WHEN_TABLEAU = "tableau && !dialogOpen && !editableFocused"
const WHEN_TABLEAU_TICKET = "tableau && ticketSelected && !dialogOpen && !editableFocused"
const WHEN_TABLEAU_COLUMN =
  "tableau && columnSelected && !ticketSelected && !dialogOpen && !editableFocused"
const WHEN_SETTINGS = "settings && !dialogOpen && !editableFocused"

export const KEYBINDINGS: ReadonlyArray<KeybindingDefinition> = [
  {
    id: "palette.open",
    group: "global",
    title: "Open Palette",
    description: "Open the Palette from any page.",
    defaultHotkey: "mod+k",
    when: WHEN_GLOBAL,
  },
  {
    id: "settings.open",
    group: "global",
    title: "Open Settings",
    description: "Open Settings from any page.",
    defaultHotkey: "mod+,",
  },
  {
    id: "thread.create",
    group: "global",
    title: "New Thread",
    description: "Create a new Thread in the current Project.",
    defaultHotkey: "mod+n",
    when: "!dialogOpen",
  },
  {
    id: "thread.rename",
    group: "thread",
    title: "Rename Thread",
    description: "Rename the open Thread in the chrome.",
    defaultHotkey: "f2",
    when: WHEN_THREAD_CHROME,
  },
  {
    id: "thread.pin",
    group: "thread",
    title: "Pin Thread",
    description: "Pin or unpin the open Thread at the top of the sidebar.",
    defaultHotkey: "mod+p",
    when: WHEN_THREAD_CHROME,
  },
  {
    id: "thread.model-picker.open",
    group: "thread",
    title: "Choose a model",
    description: "Open the Composer model picker.",
    defaultHotkey: "mod+;",
    when: WHEN_THREAD,
  },
  {
    id: "thread.settle",
    group: "thread",
    title: "Settle Thread",
    description: "Settle or unsettle the open Thread in the Settled shelf.",
    defaultHotkey: "mod+e",
    when: WHEN_THREAD,
  },
  {
    id: "board.search",
    group: "board",
    title: "Search the Board",
    description: "Focus the Board search field.",
    defaultHotkey: "/",
    when: WHEN_TABLEAU,
  },
  {
    id: "board.ticket.create",
    group: "board",
    title: "Create a ticket",
    description: "Start creating a ticket in the active column.",
    defaultHotkey: "c",
    when: WHEN_TABLEAU,
  },
  {
    id: "board.ticket.open",
    group: "board",
    title: "Open ticket",
    description: "Open the selected ticket dialog.",
    defaultHotkey: "enter",
    when: WHEN_TABLEAU_TICKET,
  },
  {
    id: "board.ticket.rename",
    group: "board",
    title: "Rename ticket",
    description: "Rename the targeted ticket.",
    defaultHotkey: "f2",
    when: WHEN_TABLEAU_TICKET,
  },
  {
    id: "board.column.rename",
    group: "board",
    title: "Rename column",
    description: "Rename the targeted column.",
    defaultHotkey: "f2",
    when: WHEN_TABLEAU_COLUMN,
  },
  {
    id: "board.navigate.up",
    group: "board",
    title: "Previous ticket",
    description: "Select the ticket above.",
    defaultHotkey: "arrowup",
    when: WHEN_TABLEAU,
  },
  {
    id: "board.navigate.down",
    group: "board",
    title: "Next ticket",
    description: "Select the ticket below.",
    defaultHotkey: "arrowdown",
    when: WHEN_TABLEAU,
  },
  {
    id: "board.navigate.left",
    group: "board",
    title: "Previous column",
    description: "Select the ticket in the column to the left.",
    defaultHotkey: "arrowleft",
    when: WHEN_TABLEAU,
  },
  {
    id: "board.navigate.right",
    group: "board",
    title: "Next column",
    description: "Select the ticket in the column to the right.",
    defaultHotkey: "arrowright",
    when: WHEN_TABLEAU,
  },
  {
    id: "board.move.up",
    group: "board",
    title: "Move ticket up",
    description: "Move the selected ticket up.",
    defaultHotkey: "alt+shift+arrowup",
    when: WHEN_TABLEAU_TICKET,
  },
  {
    id: "board.move.down",
    group: "board",
    title: "Move ticket down",
    description: "Move the selected ticket down.",
    defaultHotkey: "alt+shift+arrowdown",
    when: WHEN_TABLEAU_TICKET,
  },
  {
    id: "board.move.left",
    group: "board",
    title: "Move ticket left",
    description: "Move the selected ticket to the column on the left.",
    defaultHotkey: "alt+shift+arrowleft",
    when: WHEN_TABLEAU_TICKET,
  },
  {
    id: "board.move.right",
    group: "board",
    title: "Move ticket right",
    description: "Move the selected ticket to the column on the right.",
    defaultHotkey: "alt+shift+arrowright",
    when: WHEN_TABLEAU_TICKET,
  },
  {
    id: "settings.search",
    group: "settings",
    title: "Search Settings",
    description: "Focus the Settings search field.",
    defaultHotkey: "/",
    when: WHEN_SETTINGS,
  },
  {
    id: "settings.keybindings.search",
    group: "settings",
    title: "Search Keybindings",
    description: "Focus the Keybindings table search.",
    defaultHotkey: "mod+f",
    when: WHEN_SETTINGS,
  },
]

export interface DefaultKeybindingRule {
  readonly key: string
  readonly command: KeybindingId
  readonly when?: string
}

export const DEFAULT_KEYBINDING_RULES: ReadonlyArray<DefaultKeybindingRule> = KEYBINDINGS.map(
  (definition) =>
    definition.when === undefined
      ? { key: definition.defaultHotkey, command: definition.id }
      : { key: definition.defaultHotkey, command: definition.id, when: definition.when },
)

const keybindingById = new Map(KEYBINDINGS.map((keybinding) => [keybinding.id, keybinding]))

export const isKeybindingId = (value: string): value is KeybindingId =>
  KEYBINDING_IDS.some((id) => id === value)

export const getKeybindingDefinition = (id: KeybindingId): KeybindingDefinition => {
  const keybinding = keybindingById.get(id)
  if (keybinding === undefined) {
    throw new Error(`Unknown keybinding: ${id}`)
  }
  return keybinding
}

export const defaultKeybinding = (id: KeybindingId): string =>
  getKeybindingDefinition(id).defaultHotkey

export const defaultKeybindingWhen = (id: KeybindingId): string =>
  getKeybindingDefinition(id).when ?? ""

export const keybindingsInGroup = (group: KeybindingGroupId): ReadonlyArray<KeybindingDefinition> =>
  KEYBINDINGS.filter((keybinding) => keybinding.group === group)

export const commandLabel = (command: KeybindingId): string => {
  const definition = getKeybindingDefinition(command)
  return `${KEYBINDING_GROUP_LABELS[definition.group]}: ${definition.title}`
}
