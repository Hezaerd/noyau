import type { ReactNode } from "react"

import type { WorkspaceTab, WorkspaceTabKind, WorkspaceTabPayload } from "@/lib/workspace-panel"

export type WorkspaceTabIcon = (props: { readonly className?: string }) => ReactNode

export type WorkspaceTabRenderContext = {
  readonly tab: WorkspaceTab
  readonly isActive: boolean
  readonly isVisible: boolean
}

export type WorkspaceTabRegistration<
  Kind extends string = string,
  Payload extends WorkspaceTabPayload = WorkspaceTabPayload,
  Input = undefined,
> = WorkspaceTabKind<Kind, Payload, Input> & {
  readonly icon: WorkspaceTabIcon
  readonly render: (context: WorkspaceTabRenderContext) => ReactNode
  readonly titleOf?: (tab: WorkspaceTab) => string
  readonly available?: () => boolean
  /** false = ouvrir seulement en code (ex. un fichier), pas depuis le lanceur. */
  readonly launchable?: boolean
}

/**
 * Un kind de plus : définir create + render, puis l’ajouter au catalogue.
 * Pas de surface fantôme — create produit le payload tout de suite.
 */
export const defineWorkspaceTab = <
  Kind extends string,
  Payload extends WorkspaceTabPayload,
  Input = undefined,
>(
  definition: WorkspaceTabRegistration<Kind, Payload, Input>,
): WorkspaceTabRegistration<Kind, Payload, Input> => definition
