import type { ThreadId } from "@noyau/contracts/ids"
import { DateTime } from "effect"
import { useEffect, useEffectEvent } from "react"

import { readRendererForeground } from "@/lib/turn-notification"
import { markThreadVisited } from "@/state/thread-visits"

export const useThreadVisitTracking = (
  threadId: ThreadId | undefined,
  latestTurnCompletedAt: DateTime.Utc | null | undefined,
): void => {
  const markIfForeground = useEffectEvent(() => {
    if (threadId === undefined || !readRendererForeground()) {
      return
    }
    markThreadVisited(threadId, Date.now())
    if (latestTurnCompletedAt != null) {
      markThreadVisited(threadId, DateTime.toEpochMillis(latestTurnCompletedAt))
    }
  })

  useEffect(() => {
    markIfForeground()
  }, [latestTurnCompletedAt, threadId])

  useEffect(() => {
    const onForeground = (): void => {
      markIfForeground()
    }
    window.addEventListener("focus", onForeground)
    document.addEventListener("visibilitychange", onForeground)
    return () => {
      window.removeEventListener("focus", onForeground)
      document.removeEventListener("visibilitychange", onForeground)
    }
  }, [])
}
