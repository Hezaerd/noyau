import type {
  CursorProviderStatus,
  ProviderInstanceView,
} from "@noyau/contracts/entities/environment"

import { resolveCursorReadiness, type CursorReadiness } from "@/lib/cursor-readiness"

export const PROVIDER_CATALOG_IDS = ["cursor", "claude-code", "codex"] as const

export type ProviderCatalogId = (typeof PROVIDER_CATALOG_IDS)[number]

export type ProviderAvailability = "available" | "soon"

export type ProviderStatusDot = "disabled" | "error" | "ready" | "unknown" | "warning"

export interface ProviderCatalogEntry {
  readonly id: ProviderCatalogId
  readonly title: string
  readonly availability: ProviderAvailability
  readonly cli: string
  readonly summary: string
  readonly keywords: ReadonlyArray<string>
}

export const PROVIDER_CATALOG: ReadonlyArray<ProviderCatalogEntry> = [
  {
    id: "cursor",
    title: "Cursor",
    availability: "available",
    cli: "cursor-agent",
    summary: "Local ACP adapter. PATH detection and handshake.",
    keywords: ["cursor-agent", "acp", "cli"],
  },
  {
    id: "claude-code",
    title: "Claude Code",
    availability: "available",
    cli: "claude",
    summary: "Local Agent SDK adapter. PATH detection.",
    keywords: ["claude", "anthropic"],
  },
  {
    id: "codex",
    title: "Codex",
    availability: "available",
    cli: "codex",
    summary: "Local app-server adapter. PATH detection and handshake.",
    keywords: ["openai", "gpt", "app-server"],
  },
]

export const PROVIDER_SETTINGS_ITEMS = [
  {
    id: "provider-cursor",
    tab: "providers" as const,
    title: "Cursor",
    description: "Local ACP adapter. PATH detection and handshake.",
    keywords: ["cursor-agent", "acp", "cli"],
  },
  {
    id: "provider-claude",
    tab: "providers" as const,
    title: "Claude Code",
    description: "Local Agent SDK adapter. PATH detection.",
    keywords: ["claude", "anthropic", "claude-code"],
  },
  {
    id: "provider-codex",
    tab: "providers" as const,
    title: "Codex",
    description: "Local app-server adapter. PATH detection and handshake.",
    keywords: ["openai", "gpt", "app-server"],
  },
] as const

export interface ProviderConnectionPresentation {
  readonly headline: string
  readonly detail: string | null
  readonly statusDot: ProviderStatusDot
}

const cursorConnectionPresentation = {
  unknown: {
    headline: "Reading status…",
    detail: null,
    statusDot: "unknown",
  },
  ready: {
    headline: "Available",
    detail: "PATH · handshake OK",
    statusDot: "ready",
  },
  "not-installed": {
    headline: "CLI not found",
    detail: "Not on PATH",
    statusDot: "warning",
  },
  "handshake-failed": {
    headline: "Handshake failed",
    detail: "Detected on PATH",
    statusDot: "error",
  },
} as const satisfies Record<CursorReadiness, ProviderConnectionPresentation>

export const presentCursorConnection = (
  status: CursorProviderStatus | undefined,
): ProviderConnectionPresentation => cursorConnectionPresentation[resolveCursorReadiness(status)]

export const presentCursorVersion = (version: string | null | undefined): string | null => {
  if (version === undefined || version === null) {
    return null
  }
  return version.startsWith("v") ? version : `v${version}`
}

export const presentCursorPlan = (plan: string | null | undefined): string | null => {
  if (plan === undefined || plan === null) {
    return null
  }
  return /^cursor\b/i.test(plan) ? plan : `Cursor ${plan}`
}

export const presentClaudeConnection = presentCursorConnection

export const presentClaudeVersion = presentCursorVersion

export const presentClaudePlan = (plan: string | null | undefined): string | null => {
  if (plan === undefined || plan === null) {
    return null
  }
  return /^claude\b/i.test(plan) ? plan : `Claude ${plan}`
}

export const presentCodexConnection = presentCursorConnection

export const presentCodexVersion = presentCursorVersion

export const presentCodexPlan = (plan: string | null | undefined): string | null => {
  if (plan === undefined || plan === null) {
    return null
  }
  return /^codex\b/i.test(plan) ? plan : `Codex ${plan}`
}

const disabledConnection: ProviderConnectionPresentation = {
  headline: "Disabled",
  detail: "Hidden from new Threads",
  statusDot: "disabled",
}

export const presentProviderInstanceConnection = (
  view: ProviderInstanceView | undefined,
): ProviderConnectionPresentation => {
  if (view === undefined) {
    return cursorConnectionPresentation.unknown
  }
  if (!view.enabled) {
    return disabledConnection
  }
  return presentCursorConnection(view)
}

export const presentProviderInstanceVersion = (
  view: ProviderInstanceView | undefined,
): string | null => presentCursorVersion(view?.version)

export const presentProviderInstancePlan = (
  view: ProviderInstanceView | undefined,
): string | null => {
  if (view === undefined || view.plan === null) {
    return null
  }
  if (view.driver === "claude") {
    return presentClaudePlan(view.plan)
  }
  if (view.driver === "codex") {
    return presentCodexPlan(view.plan)
  }
  return presentCursorPlan(view.plan)
}

export const PROVIDER_STATUS_DOT_CLASS = {
  disabled: "bg-muted-foreground/35",
  error: "bg-destructive",
  ready: "bg-success",
  unknown: "bg-muted-foreground/35",
  warning: "bg-warning",
} as const satisfies Record<ProviderStatusDot, string>
