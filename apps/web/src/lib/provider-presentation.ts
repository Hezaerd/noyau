import type {
  CursorModel,
  Provider,
  ProviderInstanceView,
  ProviderInstanceViewMap,
} from "@noyau/contracts/entities/environment"
import { isBuiltinProviderDriver } from "@noyau/contracts/entities/environment"

import { ClaudeIcon, CodexIcon, CursorIcon, type ProviderIcon } from "@/components/provider-icons"

const DRIVER_ICONS: Record<string, ProviderIcon> = {
  cursor: CursorIcon,
  claude: ClaudeIcon,
  codex: CodexIcon,
}

const DRIVER_LABELS: Record<string, string> = {
  cursor: "Cursor",
  claude: "Claude Code",
  codex: "Codex",
}

export const providerDriverOf = (
  instanceId: string,
  providers: ProviderInstanceViewMap,
): string => {
  const driver = providers[instanceId as Provider]?.driver
  if (driver !== undefined) return driver
  return isBuiltinProviderDriver(instanceId) ? instanceId : instanceId
}

export const providerIconOf = (driver: string): ProviderIcon => DRIVER_ICONS[driver] ?? CursorIcon

export const providerLabelOf = (driver: string, displayName?: string): string =>
  displayName ?? DRIVER_LABELS[driver] ?? driver

export const isProviderInstanceReady = (view: ProviderInstanceView | undefined): boolean =>
  view !== undefined && view.enabled && view.handshakeOk

export const readyProviderIds = (providers: ProviderInstanceViewMap): ReadonlyArray<Provider> =>
  Object.values(providers)
    .filter(isProviderInstanceReady)
    .map((view) => view.instanceId)

export const modelsByProvider = (
  providers: ProviderInstanceViewMap,
): Record<string, ReadonlyArray<CursorModel>> => {
  const catalogs: Record<string, ReadonlyArray<CursorModel>> = {}
  for (const view of Object.values(providers)) {
    catalogs[view.instanceId] = view.models ?? []
  }
  return catalogs
}

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
