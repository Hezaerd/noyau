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
    label: "Général",
    path: "/settings/general",
    restorable: true,
  },
  {
    id: "appearance",
    label: "Apparence",
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
    label: "Raccourcis",
    path: "/settings/keybindings",
    restorable: true,
  },
]

export const SETTINGS_ITEMS: ReadonlyArray<SettingsItem> = [
  {
    id: "desktop-update-channel",
    tab: "general",
    title: "Canal de mise à jour",
    description:
      "Piste GitHub latest ou nightly à vérifier. Ne change pas la marque de l’app installée.",
    keywords: ["canal", "channel", "latest", "nightly", "update", "mise à jour"],
  },
  {
    id: "desktop-update",
    tab: "general",
    title: "Version",
    description: "Vérifie le canal de mise à jour et ouvre l’installeur GitHub unsigned.",
    keywords: ["version", "update", "mise à jour", "installeur", "release", "nightly"],
  },
  {
    id: "project-folder-start-directory",
    tab: "general",
    title: "Ajouter un Project commence dans",
    description: "Dossier affiché à l’ouverture du navigateur pour relier un Project.",
    keywords: ["project", "projet", "dossier", "folder", "chemin", "add project"],
  },
  {
    id: "project-agent-integration",
    tab: "general",
    title: "Intégration agent Noyau",
    description: "Installe et met à jour le skill Noyau du Project courant.",
    keywords: ["project", "agent", "skill", "skills.sh", "mcp", "tableau", "ticket"],
  },
  {
    id: "default-thread-env-mode",
    tab: "general",
    title: "Checkout d'un nouveau Thread",
    description:
      "Intention de draft : nouveau worktree isolé, ou checkout courant du WorkspaceRoot.",
    keywords: ["thread", "worktree", "checkout", "local", "nouveau thread", "git", "environnement"],
  },
  {
    id: "auto-remove-merged-worktree",
    tab: "general",
    title: "Supprimer le worktree après merge",
    description: "Retire le worktree lié quand la PR live est fusionnée. Désactivé par défaut.",
    keywords: ["worktree", "merge", "pr", "cleanup", "supprimer", "git", "fusion"],
  },
  {
    id: "auto-settle-merged-threads",
    tab: "general",
    title: "Classer après merge de PR",
    description: "Classe le Thread quand sa PR live est fusionnée. Une PR fermée classe toujours.",
    keywords: ["settle", "classer", "merge", "pr", "fusion", "thread", "sidebar"],
  },
  {
    id: "auto-settle-inactive-threads",
    tab: "general",
    title: "Classer après inactivité",
    description: "Classe les Threads sans activité depuis ce nombre de jours.",
    keywords: ["settle", "classer", "inactivité", "jours", "thread", "sidebar"],
  },
  {
    id: "auto-settle-after-days",
    tab: "general",
    title: "Jours d'inactivité",
    description: "Une nouvelle activité déclasse automatiquement le Thread.",
    keywords: ["settle", "classer", "jours", "inactivité", "seuil"],
  },
  {
    id: "turn-cue",
    tab: "general",
    title: "Son de fin de Turn",
    description: "Joue un ding quand un Turn se termine.",
    keywords: ["son", "ding", "sound", "cuelume", "turn", "audio"],
  },
  {
    id: "turn-cue-sound",
    tab: "general",
    title: "Son",
    description: "Joué à la fin d'un Turn.",
    keywords: ["son", "cuelume", "chime", "arrival", "sparkle", "bloom"],
  },
  {
    id: "turn-notification",
    tab: "general",
    title: "Notifications de fin de Turn",
    description:
      "Bannière OS quand un Turn se termine hors du Thread ouvert, ou si la fenêtre est en arrière-plan.",
    keywords: ["notification", "badge", "dock", "système", "turn", "attente"],
  },
  {
    id: "discord-rich-presence",
    tab: "general",
    title: "Discord Rich Presence",
    description: "Affiche le Project et le Thread ouverts sur ton profil Discord.",
    keywords: ["discord", "rich presence", "status", "activité", "presence"],
  },
  {
    id: "appearance",
    tab: "appearance",
    title: "Apparence",
    description: "Choisis comment Noyau s’affiche : système, clair ou sombre.",
    keywords: ["thème", "theme", "clair", "sombre", "dark", "light", "système"],
  },
  {
    id: "transcript-paint",
    tab: "appearance",
    title: "Peinture du transcript",
    description: "Fluide peint la bulle live au rythme de l’écran. Immédiat applique chaque hint.",
    keywords: ["streaming", "fluide", "smooth", "transcript", "bulle", "60fps", "immédiat"],
  },
  {
    id: "providers",
    tab: "providers",
    title: "Providers",
    description: "Providers IA branchés à Noyau : Cursor, Claude Code et Codex.",
    keywords: ["ia", "ai", "agent", "provider", "cursor", "claude", "codex"],
  },
  ...PROVIDER_SETTINGS_ITEMS,
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
    keywords: [
      "raccourci",
      "clavier",
      "condition",
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
