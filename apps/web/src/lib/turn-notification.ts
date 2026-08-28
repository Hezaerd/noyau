import type { TurnSettlementState } from "@noyau/contracts/entities/turn"

export const isRendererForeground = (input: {
  readonly visibilityState: DocumentVisibilityState
  readonly hasFocus: boolean
}): boolean => input.visibilityState === "visible" && input.hasFocus

export const readRendererForeground = (): boolean =>
  isRendererForeground({
    visibilityState: document.visibilityState,
    hasFocus: document.hasFocus(),
  })

export const shouldNotifyTurnSettlement = (input: {
  readonly enabled: boolean
  readonly isDesktop: boolean
  readonly threadId: string
  readonly openThreadId: string | undefined
  readonly windowFocused: boolean
}): boolean => {
  if (!input.enabled || !input.isDesktop) {
    return false
  }
  return !(input.windowFocused && input.openThreadId === input.threadId)
}

export const turnNotificationBody = (
  state: TurnSettlementState,
  projectName: string | undefined,
): string => {
  const status =
    state === "completed" ? "Terminé" : state === "interrupted" ? "Interrompu" : "Erreur"
  return projectName === undefined || projectName.length === 0
    ? status
    : `${projectName} · ${status}`
}
