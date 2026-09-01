import { useEffect, useEffectEvent, useRef } from "react"

import { useThreads } from "@/hooks/use-control-plane"
import { useTurnCuePreference } from "@/hooks/use-turn-cue"
import { playTurnCue, settledTurns, type TurnCueThread } from "@/lib/turn-cue"

export const useTurnSettlementCue = (): void => {
  const threads = useThreads()
  const cuePreference = useTurnCuePreference()
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
  })

  useEffect(() => {
    onSettlements(threads)
  }, [threads])
}
