import type { ProjectId, ThreadId } from "@noyau/contracts/ids"

import { isDesktopRuntime } from "@/lib/desktop-bridge"

export interface DesktopTurnNotification {
  readonly projectId: ProjectId
  readonly threadId: ThreadId
  readonly title: string
  readonly body: string
}

export const setDesktopBadgeCount = (count: number): void => {
  void window.noyauDesktop?.setBadgeCount?.(count)
}

export const showDesktopTurnNotification = (input: DesktopTurnNotification): void => {
  if (!isDesktopRuntime()) {
    return
  }
  void window.noyauDesktop?.showTurnNotification?.(input)
}

export const subscribeOpenThreadFromNotification = (
  listener: (input: { readonly projectId: ProjectId; readonly threadId: ThreadId }) => void,
): (() => void) => {
  const subscribe = window.noyauDesktop?.onOpenThreadFromNotification
  if (subscribe === undefined) {
    return () => undefined
  }
  return subscribe(listener)
}
