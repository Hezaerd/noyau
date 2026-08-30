import { SquareTerminalIcon } from "lucide-react"

import { defineWorkspaceTab } from "./define-workspace-tab"
import { renderTerminalTab } from "./ThreadTerminal"

export const terminalWorkspaceTab = defineWorkspaceTab({
  kind: "terminal",
  label: "Terminal",
  keepMounted: true,
  icon: SquareTerminalIcon,
  create: (tabId: string) => ({ terminalId: tabId }),
  titleOf: () => "Terminal",
  render: renderTerminalTab,
})

/**
 * Catalogue des tools du panneau. Ajouter un kind = un `defineWorkspaceTab` +
 * une entrée ici. Le lanceur, le menu +, le persist et le keep-mount suivent.
 */
export const workspaceTabCatalog = [terminalWorkspaceTab] as const

export const workspaceTabByKind = new Map(
  workspaceTabCatalog.map((registration) => [registration.kind, registration]),
)

export const workspaceTabSanitizeKinds = new Set(
  workspaceTabCatalog.map((registration) => registration.kind),
)

export const workspaceTabKeepMountedKinds = new Set(
  workspaceTabCatalog.flatMap((registration) =>
    registration.keepMounted === true ? [registration.kind] : [],
  ),
)
