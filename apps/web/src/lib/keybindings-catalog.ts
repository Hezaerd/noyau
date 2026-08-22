import type { Hotkey } from "@tanstack/react-hotkeys"

export const KEYBINDING_GROUP_IDS = ["global", "board", "thread", "settings"] as const

export type KeybindingGroupId = (typeof KEYBINDING_GROUP_IDS)[number]

export const KEYBINDING_IDS = [
  "palette.open",
  "settings.open",
  "thread.create",
  "thread.rename",
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
}

export const KEYBINDING_GROUP_LABELS = {
  global: "Général",
  board: "Tableau",
  thread: "Thread",
  settings: "Paramètres",
} as const satisfies Record<KeybindingGroupId, string>

export const KEYBINDINGS: ReadonlyArray<KeybindingDefinition> = [
  {
    id: "palette.open",
    group: "global",
    title: "Ouvrir la Palette",
    description: "Ouvre la Palette depuis n’importe quelle page.",
    defaultHotkey: "Mod+K",
  },
  {
    id: "settings.open",
    group: "global",
    title: "Ouvrir les Paramètres",
    description: "Ouvre les Paramètres depuis n’importe quelle page.",
    defaultHotkey: "Mod+,",
  },
  {
    id: "thread.create",
    group: "global",
    title: "Nouveau Thread",
    description: "Ouvre un nouveau Thread dans le Project courant.",
    defaultHotkey: "Mod+N",
  },
  {
    id: "thread.rename",
    group: "thread",
    title: "Renommer le Thread",
    description: "Renomme le Thread ouvert dans le chrome.",
    defaultHotkey: "F2",
  },
  {
    id: "board.search",
    group: "board",
    title: "Rechercher dans le Tableau",
    description: "Place le focus dans la recherche du Tableau.",
    defaultHotkey: "/",
  },
  {
    id: "board.ticket.create",
    group: "board",
    title: "Créer un ticket",
    description: "Ouvre la création d’un ticket dans la colonne active.",
    defaultHotkey: "C",
  },
  {
    id: "board.ticket.open",
    group: "board",
    title: "Ouvrir le ticket",
    description: "Ouvre le Dialog du ticket sélectionné.",
    defaultHotkey: "Enter",
  },
  {
    id: "board.ticket.rename",
    group: "board",
    title: "Renommer le ticket",
    description: "Renomme le ticket ciblé.",
    defaultHotkey: "F2",
  },
  {
    id: "board.column.rename",
    group: "board",
    title: "Renommer la colonne",
    description: "Renomme la colonne ciblée.",
    defaultHotkey: "F2",
  },
  {
    id: "board.navigate.up",
    group: "board",
    title: "Ticket précédent",
    description: "Sélectionne le ticket au-dessus.",
    defaultHotkey: "ArrowUp",
  },
  {
    id: "board.navigate.down",
    group: "board",
    title: "Ticket suivant",
    description: "Sélectionne le ticket en dessous.",
    defaultHotkey: "ArrowDown",
  },
  {
    id: "board.navigate.left",
    group: "board",
    title: "Colonne précédente",
    description: "Sélectionne le ticket dans la colonne de gauche.",
    defaultHotkey: "ArrowLeft",
  },
  {
    id: "board.navigate.right",
    group: "board",
    title: "Colonne suivante",
    description: "Sélectionne le ticket dans la colonne de droite.",
    defaultHotkey: "ArrowRight",
  },
  {
    id: "board.move.up",
    group: "board",
    title: "Monter le ticket",
    description: "Déplace le ticket sélectionné vers le haut.",
    defaultHotkey: "Alt+Shift+ArrowUp",
  },
  {
    id: "board.move.down",
    group: "board",
    title: "Descendre le ticket",
    description: "Déplace le ticket sélectionné vers le bas.",
    defaultHotkey: "Alt+Shift+ArrowDown",
  },
  {
    id: "board.move.left",
    group: "board",
    title: "Ticket vers la gauche",
    description: "Déplace le ticket sélectionné dans la colonne de gauche.",
    defaultHotkey: "Alt+Shift+ArrowLeft",
  },
  {
    id: "board.move.right",
    group: "board",
    title: "Ticket vers la droite",
    description: "Déplace le ticket sélectionné dans la colonne de droite.",
    defaultHotkey: "Alt+Shift+ArrowRight",
  },
  {
    id: "settings.search",
    group: "settings",
    title: "Rechercher dans les Paramètres",
    description: "Place le focus dans la recherche des Paramètres.",
    defaultHotkey: "/",
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
