import { browserWorkspaceTab } from "./browser-tab"
import type { WorkspaceTabRegistration } from "./define-workspace-tab"
import { pullRequestWorkspaceTab } from "./pr-tab"

/**
 * Catalogue des tools du panneau. Ajouter un kind = un `defineWorkspaceTab` +
 * une entrée ici. Le lanceur, le menu +, le persist et le keep-mount suivent.
 */
export const workspaceTabCatalog: ReadonlyArray<WorkspaceTabRegistration> = [
  browserWorkspaceTab,
  pullRequestWorkspaceTab,
]

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
