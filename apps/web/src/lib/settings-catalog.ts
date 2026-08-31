import { KEYBINDINGS } from "@/lib/keybindings-catalog"
import { PROVIDER_SETTINGS_ITEMS } from "@/lib/providers-catalog"

export const SETTINGS_TAB_IDS = ["general", "appearance", "providers", "keybindings"] as const

export type SettingsTabId = (typeof SETTINGS_TAB_IDS)[number]

export const DEFAULT_SETTINGS_TAB = "general" satisfies SettingsTabId

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
    id: "general",
    label: "General",
    path: "/settings/general",
    restorable: true,
  },
  {
    id: "appearance",
    label: "Appearance",
    path: "/settings/appearance",
    restorable: true,
  },
  {
    id: "providers",
    label: "Providers",
    path: "/settings/providers",
    restorable: false,
  },
  {
    id: "keybindings",
    label: "Keybindings",
    path: "/settings/keybindings",
    restorable: true,
  },
]

export const SETTINGS_ITEMS: ReadonlyArray<SettingsItem> = [
  {
    id: "project-folder-start-directory",
    tab: "general",
    title: "Add a Project starts in",
    description: "Folder shown when the picker opens to link a Project.",
    keywords: ["project", "folder", "path", "add project"],
  },
  {
    id: "project-agent-integration",
    tab: "general",
    title: "Noyau agent integration",
    description: "Install and update the Noyau skill for the current Project.",
    keywords: ["project", "agent", "skill", "skills.sh", "mcp", "board", "ticket"],
  },
  {
    id: "default-thread-env-mode",
    tab: "general",
    title: "Checkout for a new Thread",
    description: "Draft intent: isolated new worktree, or the current WorkspaceRoot checkout.",
    keywords: ["thread", "worktree", "checkout", "local", "new thread", "git", "environment"],
  },
  {
    id: "auto-settle-merged-threads",
    tab: "general",
    title: "Settle after PR merge",
    description: "Settle the Thread when its live PR is merged. A closed PR always settles.",
    keywords: ["settle", "merge", "pr", "thread", "sidebar"],
  },
  {
    id: "auto-settle-inactive-threads",
    tab: "general",
    title: "Settle after inactivity",
    description: "Settle Threads with no activity for this many days.",
    keywords: ["settle", "inactivity", "days", "thread", "sidebar"],
  },
  {
    id: "auto-settle-after-days",
    tab: "general",
    title: "Inactivity days",
    description: "New activity automatically unsettles the Thread.",
    keywords: ["settle", "days", "inactivity", "threshold"],
  },
  {
    id: "turn-cue",
    tab: "general",
    title: "Turn end sound",
    description: "Play a ding when a Turn finishes.",
    keywords: ["sound", "ding", "cuelume", "turn", "audio"],
  },
  {
    id: "turn-cue-sound",
    tab: "general",
    title: "Sound",
    description: "Played at the end of a Turn.",
    keywords: ["sound", "cuelume", "chime", "arrival", "sparkle", "bloom"],
  },
  {
    id: "turn-notification",
    tab: "general",
    title: "Turn end notifications",
    description: "OS banner when a Turn finishes while Noyau is not focused.",
    keywords: ["notification", "badge", "dock", "system", "turn"],
  },
  {
    id: "discord-rich-presence",
    tab: "general",
    title: "Discord Rich Presence",
    description: "Show the open Project and Thread on your Discord profile.",
    keywords: ["discord", "rich presence", "status", "activity", "presence"],
  },
  {
    id: "about",
    tab: "general",
    title: "About",
    description: "Installed Noyau version and desktop updates.",
    keywords: ["about", "version", "update", "nightly", "release"],
  },
  {
    id: "desktop-update",
    tab: "general",
    title: "Version",
    description:
      "Installed version. Packaged apps can check GitHub and open the unsigned installer.",
    keywords: ["version", "update", "installer", "release", "nightly", "about"],
  },
  {
    id: "appearance",
    tab: "appearance",
    title: "Appearance",
    description: "Choose how Noyau looks: system, light, or dark.",
    keywords: ["theme", "light", "dark", "system"],
  },
  {
    id: "providers",
    tab: "providers",
    title: "Providers",
    description: "Enable or disable the providers Noyau can start a Thread with.",
    keywords: ["ai", "agent", "provider", "cursor", "claude", "codex"],
  },
  ...PROVIDER_SETTINGS_ITEMS,
  {
    id: "keybindings",
    tab: "keybindings",
    title: "Keybindings",
    description: "Customizable app keybindings.",
    keywords: ["keyboard", "hotkey", "shortcut", "keybind"],
  },
  ...KEYBINDINGS.map((keybinding) => ({
    id: keybinding.id,
    tab: "keybindings" as const,
    title: keybinding.title,
    description: keybinding.description,
    keywords: [
      "shortcut",
      "keyboard",
      "when",
      keybinding.defaultHotkey,
      ...(keybinding.when === undefined ? [] : [keybinding.when]),
    ],
  })),
]

export interface SettingsSearchHit {
  readonly id: string
  readonly title: string
  readonly tab: SettingsTab
}

const settingsTabById = new Map(SETTINGS_TABS.map((tab) => [tab.id, tab]))

export const isSettingsPath = (pathname: string): boolean =>
  pathname === "/settings" || pathname.startsWith("/settings/")

export const isSettingsTabId = (value: string): value is SettingsTabId =>
  SETTINGS_TAB_IDS.some((id) => id === value)

export const parseSettingsTabId = (value: string): SettingsTabId =>
  isSettingsTabId(value) ? value : DEFAULT_SETTINGS_TAB

export const resolveSettingsTabFromPathname = (pathname: string): SettingsTab => {
  if (pathname === "/settings") {
    return getSettingsTab(DEFAULT_SETTINGS_TAB)
  }

  const segment = pathname.startsWith("/settings/")
    ? (pathname.slice("/settings/".length).split("/")[0] ?? "")
    : ""

  return getSettingsTab(parseSettingsTabId(segment))
}

export const getSettingsTab = (id: SettingsTabId): SettingsTab => {
  const tab = settingsTabById.get(id)
  if (tab === undefined) {
    throw new Error(`Unknown Settings tab: ${id}`)
  }
  return tab
}

const normalizeSettingsQuery = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en")
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
