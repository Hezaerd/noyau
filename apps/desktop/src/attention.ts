import type { OpenThreadFromNotification, TurnNotification } from "./attention-contract"

export const normalizeBadgeCount = (count: number): number => {
  if (!Number.isFinite(count) || count <= 0) {
    return 0
  }
  return Math.floor(count)
}

export const shouldShowTurnNotification = (mainWindowFocused: boolean): boolean =>
  !mainWindowFocused

export interface TurnNotificationOptions {
  readonly title: string
  readonly body: string
  readonly silent: true
}

export const turnNotificationOptions = (input: TurnNotification): TurnNotificationOptions => ({
  title: input.title,
  body: input.body,
  silent: true,
})

export const openThreadFromNotification = (
  input: TurnNotification,
): OpenThreadFromNotification => ({
  projectId: input.projectId,
  threadId: input.threadId,
})
