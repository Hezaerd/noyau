import type { Hotkey } from "@tanstack/react-hotkeys"

import type { KeybindingCondition } from "@/lib/keybinding-when"

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
] as const

export type KeybindingId = (typeof KEYBINDING_IDS)[number]

export interface KeybindingDefinition {
  readonly id: KeybindingId
  readonly group: KeybindingGroupId
  readonly title: string
  readonly description: string
  readonly defaultHotkey: Hotkey
  readonly when: KeybindingCondition
}

export const KEYBINDING_GROUP_LABELS = {
  global: "Général",
  board: "Tableau",
  thread: "Thread",
  settings: "Paramètres",
} as const satisfies Record<KeybindingGroupId, string>

const WHEN_GLOBAL = {
  dialogOpen: false,
  editableFocused: false,
} as const satisfies KeybindingCondition

const WHEN_THREAD = {
  surface: "thread",
  dialogOpen: false,
} as const satisfies KeybindingCondition

const WHEN_THREAD_CHROME = {
  surface: "thread",
  dialogOpen: false,
  editableFocused: false,
} as const satisfies KeybindingCondition

const WHEN_TABLEAU = {
  surface: "tableau",
  dialogOpen: false,
  editableFocused: false,
} as const satisfies KeybindingCondition

const WHEN_TABLEAU_TICKET = {
  surface: "tableau",
  ticketSelected: true,
  dialogOpen: false,
  editableFocused: false,
} as const satisfies KeybindingCondition

const WHEN_TABLEAU_COLUMN = {
  surface: "tableau",
  columnSelected: true,
  ticketSelected: false,
  dialogOpen: false,
  editableFocused: false,
} as const satisfies KeybindingCondition

const WHEN_SETTINGS = {
  surface: "settings",
  dialogOpen: false,
  editableFocused: false,
} as const satisfies KeybindingCondition

export const KEYBINDINGS: ReadonlyArray<KeybindingDefinition> = [
  {
    id: "palette.open",
    group: "global",
    title: "Ouvrir la Palette",
    description: "Ouvre la Palette depuis n’importe quelle page.",
    defaultHotkey: "Mod+K",
    when: WHEN_GLOBAL,
  },
  {
    id: "settings.open",
    group: "global",
    title: "Ouvrir les Paramètres",
    description: "Ouvre les Paramètres depuis n’importe quelle page.",
    defaultHotkey: "Mod+,",
    when: {},
  },
  {
    id: "thread.create",
    group: "global",
    title: "Nouveau Thread",
    description: "Ouvre un nouveau Thread dans le Project courant.",
    defaultHotkey: "Mod+N",
    when: { dialogOpen: false },
  },
  {
    id: "thread.rename",
    group: "thread",
    title: "Renommer le Thread",
    description: "Renomme le Thread ouvert dans le chrome.",
    defaultHotkey: "F2",
    when: WHEN_THREAD_CHROME,
  },
  {
    id: "thread.pin",
    group: "thread",
    title: "Épingler le Thread",
    description: "Épingle ou désépingle le Thread ouvert en haut de la sidebar.",
    defaultHotkey: "Mod+P",
    when: WHEN_THREAD_CHROME,
  },
  {
    id: "thread.model-picker.open",
    group: "thread",
    title: "Choisir un modèle",
    description: "Ouvre le sélecteur de modèle du Composer.",
    defaultHotkey: "Mod+;",
    when: WHEN_THREAD,
  },
  {
    id: "thread.settle",
    group: "thread",
    title: "Classer le Thread",
    description: "Classe ou déclasse le Thread ouvert dans la queue Classés.",
    defaultHotkey: "Mod+E",
    when: WHEN_THREAD,
  },
  {
    id: "board.search",
    group: "board",
    title: "Rechercher dans le Tableau",
    description: "Place le focus dans la recherche du Tableau.",
    defaultHotkey: "/",
    when: WHEN_TABLEAU,
  },
  {
    id: "board.ticket.create",
    group: "board",
    title: "Créer un ticket",
    description: "Ouvre la création d’un ticket dans la colonne active.",
    defaultHotkey: "C",
    when: WHEN_TABLEAU,
  },
  {
    id: "board.ticket.open",
    group: "board",
    title: "Ouvrir le ticket",
    description: "Ouvre le Dialog du ticket sélectionné.",
    defaultHotkey: "Enter",
    when: WHEN_TABLEAU_TICKET,
  },
  {
    id: "board.ticket.rename",
    group: "board",
    title: "Renommer le ticket",
    description: "Renomme le ticket ciblé.",
    defaultHotkey: "F2",
    when: WHEN_TABLEAU_TICKET,
  },
  {
    id: "board.column.rename",
    group: "board",
    title: "Renommer la colonne",
    description: "Renomme la colonne ciblée.",
    defaultHotkey: "F2",
    when: WHEN_TABLEAU_COLUMN,
  },
  {
    id: "board.navigate.up",
    group: "board",
    title: "Ticket précédent",
    description: "Sélectionne le ticket au-dessus.",
    defaultHotkey: "ArrowUp",
    when: WHEN_TABLEAU,
  },
  {
    id: "board.navigate.down",
    group: "board",
    title: "Ticket suivant",
    description: "Sélectionne le ticket en dessous.",
    defaultHotkey: "ArrowDown",
    when: WHEN_TABLEAU,
  },
  {
    id: "board.navigate.left",
    group: "board",
    title: "Colonne précédente",
    description: "Sélectionne le ticket dans la colonne de gauche.",
    defaultHotkey: "ArrowLeft",
    when: WHEN_TABLEAU,
  },
  {
    id: "board.navigate.right",
    group: "board",
    title: "Colonne suivante",
    description: "Sélectionne le ticket dans la colonne de droite.",
    defaultHotkey: "ArrowRight",
    when: WHEN_TABLEAU,
  },
  {
    id: "board.move.up",
    group: "board",
    title: "Monter le ticket",
    description: "Déplace le ticket sélectionné vers le haut.",
    defaultHotkey: "Alt+Shift+ArrowUp",
    when: WHEN_TABLEAU_TICKET,
  },
  {
    id: "board.move.down",
    group: "board",
    title: "Descendre le ticket",
    description: "Déplace le ticket sélectionné vers le bas.",
    defaultHotkey: "Alt+Shift+ArrowDown",
    when: WHEN_TABLEAU_TICKET,
  },
  {
    id: "board.move.left",
    group: "board",
    title: "Ticket vers la gauche",
    description: "Déplace le ticket sélectionné dans la colonne de gauche.",
    defaultHotkey: "Alt+Shift+ArrowLeft",
    when: WHEN_TABLEAU_TICKET,
  },
  {
    id: "board.move.right",
    group: "board",
    title: "Ticket vers la droite",
    description: "Déplace le ticket sélectionné dans la colonne de droite.",
    defaultHotkey: "Alt+Shift+ArrowRight",
    when: WHEN_TABLEAU_TICKET,
  },
  {
    id: "settings.search",
    group: "settings",
    title: "Rechercher dans les Paramètres",
    description: "Place le focus dans la recherche des Paramètres.",
    defaultHotkey: "/",
    when: WHEN_SETTINGS,
  },
]

const keybindingById = new Map(KEYBINDINGS.map((keybinding) => [keybinding.id, keybinding]))

export const isKeybindingId = (value: string): value is KeybindingId =>
  KEYBINDING_IDS.some((id) => id === value)

export const getKeybindingDefinition = (id: KeybindingId): KeybindingDefinition => {
  const keybinding = keybindingById.get(id)
  if (keybinding === undefined) {
    throw new Error(`Keybinding inconnu: ${id}`)
  }
  return keybinding
}

export const defaultKeybinding = (id: KeybindingId): Hotkey =>
  getKeybindingDefinition(id).defaultHotkey

export const keybindingsInGroup = (group: KeybindingGroupId): ReadonlyArray<KeybindingDefinition> =>
  KEYBINDINGS.filter((keybinding) => keybinding.group === group)
