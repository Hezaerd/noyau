import type { CursorProviderStatus } from "@noyau/protocol/entities/environment"

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
    summary: "Adaptateur ACP local. Détection PATH et handshake.",
    keywords: ["cursor-agent", "acp", "cli"],
  },
  {
    id: "claude-code",
    title: "Claude Code",
    availability: "available",
    cli: "claude",
    summary: "Adaptateur Agent SDK local. Détection PATH.",
    keywords: ["claude", "anthropic"],
  },
  {
    id: "codex",
    title: "Codex",
    availability: "available",
    cli: "codex",
    summary: "Adaptateur app-server local. Détection PATH et handshake.",
    keywords: ["openai", "gpt", "app-server"],
  },
]

export const PROVIDER_SETTINGS_ITEMS = PROVIDER_CATALOG.map((provider) => ({
  id: `provider-${provider.id}`,
  tab: "providers" as const,
  title: provider.title,
  description: provider.summary,
  keywords: [...provider.keywords, provider.cli],
}))

export interface ProviderConnectionPresentation {
  readonly headline: string
  readonly detail: string | null
  readonly statusDot: ProviderStatusDot
}

const cursorConnectionPresentation = {
  unknown: {
    headline: "Lecture du statut…",
    detail: null,
    statusDot: "unknown",
  },
  ready: {
    headline: "Disponible",
    detail: "PATH · handshake OK",
    statusDot: "ready",
  },
  "not-installed": {
    headline: "CLI introuvable",
    detail: "Absent du PATH",
    statusDot: "warning",
  },
  "handshake-failed": {
    headline: "Handshake échoué",
    detail: "Détecté dans le PATH",
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

export const PROVIDER_STATUS_DOT_CLASS = {
  disabled: "bg-muted-foreground/35",
  error: "bg-destructive",
  ready: "bg-success",
  unknown: "bg-muted-foreground/35",
  warning: "bg-warning",
} as const satisfies Record<ProviderStatusDot, string>
