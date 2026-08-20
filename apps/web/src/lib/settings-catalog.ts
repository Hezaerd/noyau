import { KEYBINDINGS } from "@/lib/keybindings-catalog"

export const SETTINGS_TAB_IDS = ["appearance", "keybindings"] as const

export type SettingsTabId = (typeof SETTINGS_TAB_IDS)[number]

export const DEFAULT_SETTINGS_TAB = "appearance" satisfies SettingsTabId

export interface SettingsTab {
  readonly id: SettingsTabId
  readonly label: string
  readonly path: `/settings/${SettingsTabId}`
  readonly restorable: boolean
}

export interface SettingsItem {
  readonly id: string
  readonly tab: SettingsTabId
  readonly title: string
  readonly description: string
  readonly keywords: ReadonlyArray<string>
}

export const SETTINGS_TABS: ReadonlyArray<SettingsTab> = [
  {
    id: "appearance",
    label: "Apparence",
    path: "/settings/appearance",
    restorable: true,
  },
  {
    id: "keybindings",
    label: "Raccourcis",
    path: "/settings/keybindings",
    restorable: true,
  },
]

export const SETTINGS_ITEMS: ReadonlyArray<SettingsItem> = [
  {
    id: "appearance",
    tab: "appearance",
    title: "Apparence",
    description: "Choisis comment Noyau s’affiche : système, clair ou sombre.",
    keywords: ["thème", "theme", "clair", "sombre", "dark", "light", "système"],
  },
  {
    id: "keybindings",
    tab: "keybindings",
    title: "Raccourcis",
    description: "Keybindings personnalisables de l’app.",
    keywords: ["clavier", "hotkey", "shortcut", "keybind", "raccourci"],
  },
  ...KEYBINDINGS.map((keybinding) => ({
    id: keybinding.id,
    tab: "keybindings" as const,
    title: keybinding.title,
    description: keybinding.description,
    keywords: ["raccourci", "clavier", keybinding.defaultHotkey],
  })),
]

export interface SettingsSearchHit {
  readonly id: string
  readonly title: string
  readonly tab: SettingsTab
}

const settingsTabById = new Map(SETTINGS_TABS.map((tab) => [tab.id, tab]))

export const isSettingsTabId = (value: string): value is SettingsTabId =>
  SETTINGS_TAB_IDS.some((id) => id === value)

export const parseSettingsTabId = (value: string): SettingsTabId =>
  isSettingsTabId(value) ? value : DEFAULT_SETTINGS_TAB

export const getSettingsTab = (id: SettingsTabId): SettingsTab => {
  const tab = settingsTabById.get(id)
  if (tab === undefined) {
    throw new Error(`Tab Paramètres inconnu: ${id}`)
  }
  return tab
}

const normalizeSettingsQuery = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr")
    .trim()

const itemSearchValue = (item: SettingsItem, tab: SettingsTab): string =>
  [item.title, item.description, tab.label, ...item.keywords].join(" ")

export const searchSettings = (query: string): ReadonlyArray<SettingsSearchHit> => {
  const normalizedQuery = normalizeSettingsQuery(query)
  if (normalizedQuery === "") {
    return []
  }

  return SETTINGS_ITEMS.flatMap((item) => {
    const tab = getSettingsTab(item.tab)
    if (!normalizeSettingsQuery(itemSearchValue(item, tab)).includes(normalizedQuery)) {
      return []
    }
    return [{ id: item.id, title: item.title, tab }]
  })
}
