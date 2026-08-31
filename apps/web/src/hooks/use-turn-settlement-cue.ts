import { useEffect, useEffectEvent, useRef } from "react"

import { useProjects, useThreads } from "@/hooks/use-control-plane"
import { useTurnCuePreference } from "@/hooks/use-turn-cue"
import { useTurnNotificationEnabled } from "@/hooks/use-turn-notification"
import { showDesktopTurnNotification } from "@/lib/desktop-attention"
import { isDesktopRuntime } from "@/lib/desktop-bridge"
import { playTurnCue, settledTurns, type TurnCueThread } from "@/lib/turn-cue"
import { turnNotificationBody } from "@/lib/turn-notification"

export const useTurnSettlementCue = (): void => {
  const threads = useThreads()
  const projects = useProjects()
  const cuePreference = useTurnCuePreference()
  const notificationsEnabled = useTurnNotificationEnabled()
  const previousRef = useRef<ReadonlyArray<TurnCueThread> | undefined>(undefined)

  const onSettlements = useEffectEvent((next: typeof threads) => {
    const previous = previousRef.current
    previousRef.current = next
    if (previous === undefined) {
      return
    }
    const settlements = settledTurns(previous, next)
    if (settlements.length === 0) {
      return
    }
    if (cuePreference.enabled) {
      playTurnCue(cuePreference.sound)
    }
    if (!notificationsEnabled || !isDesktopRuntime()) {
      return
    }
    for (const settlement of settlements) {
      const thread = next.find((candidate) => candidate.id === settlement.threadId)
      if (thread === undefined) {
        continue
      }
      const project = projects.find((candidate) => candidate.id === thread.projectId)
      showDesktopTurnNotification({
        projectId: thread.projectId,
        threadId: thread.id,
        title: thread.title,
        body: turnNotificationBody(settlement.state, project?.name),
      })
    }
  })

  useEffect(() => {
    onSettlements(threads)
  }, [threads])
}
