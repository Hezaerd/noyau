import type {
  Provider,
  ProviderInstanceView,
  ProviderInstanceViewMap,
} from "@noyau/contracts/entities/environment"
import { isBuiltinProviderDriver } from "@noyau/contracts/entities/environment"

import { ClaudeIcon, CodexIcon, CursorIcon, type ProviderIcon } from "@/components/provider-icons"

const DRIVER_ICONS = {
  cursor: CursorIcon,
  claude: ClaudeIcon,
  codex: CodexIcon,
} as const

export const providerDriverOf = (
  instanceId: Provider,
  providers: ProviderInstanceViewMap,
): string => {
  const driver = providers[instanceId]?.driver
  if (driver !== undefined) return driver
  return isBuiltinProviderDriver(instanceId) ? instanceId : instanceId
}

export const providerIconOf = (driver: string): ProviderIcon => {
  if (driver === "cursor") return DRIVER_ICONS.cursor
  if (driver === "claude") return DRIVER_ICONS.claude
  if (driver === "codex") return DRIVER_ICONS.codex
  return CursorIcon
}

export const providerLabelOf = (driver: string, displayName?: string): string => {
  if (displayName !== undefined) return displayName
  if (driver === "cursor") return "Cursor"
  if (driver === "claude") return "Claude Code"
  if (driver === "codex") return "Codex"
  return driver
}

export const isProviderInstanceReady = (view: ProviderInstanceView | undefined): boolean =>
  view !== undefined && view.enabled && view.handshakeOk

export const readyProviderIds = (providers: ProviderInstanceViewMap): ReadonlyArray<Provider> =>
  Object.values(providers)
    .filter(isProviderInstanceReady)
    .map((view) => view.instanceId)

export const modelsByProvider = (providers: ProviderInstanceViewMap) =>
  Object.fromEntries(Object.values(providers).map((view) => [view.instanceId, view.models ?? []]))

export const orderedProviderViews = (
  providers: ProviderInstanceViewMap,
): ReadonlyArray<ProviderInstanceView> => {
  const preferred = ["cursor", "claude", "codex"]
  const views = Object.values(providers)
  return views.toSorted((left, right) => {
    const leftIndex = preferred.indexOf(left.instanceId)
    const rightIndex = preferred.indexOf(right.instanceId)
    if (leftIndex === -1 && rightIndex === -1) {
      return left.instanceId.localeCompare(right.instanceId)
    }
    if (leftIndex === -1) return 1
    if (rightIndex === -1) return -1
    return leftIndex - rightIndex
  })
}
