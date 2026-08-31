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

export const turnNotificationBody = (
  state: TurnSettlementState,
  projectName: string | undefined,
): string => {
  const status = state === "completed" ? "Done" : state === "interrupted" ? "Interrupted" : "Error"
  return projectName === undefined || projectName.length === 0
    ? status
    : `${projectName} · ${status}`
}
