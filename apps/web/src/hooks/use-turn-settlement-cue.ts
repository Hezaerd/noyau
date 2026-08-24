import { useEffect, useEffectEvent, useRef } from "react"

import { useControlPlaneSelector } from "@/hooks/use-control-plane"
import { useTurnCuePreference } from "@/hooks/use-turn-cue"
import { playTurnCue, settledTurns, type TurnCueThread } from "@/lib/turn-cue"

export const useTurnSettlementCue = (): void => {
  const threads = useControlPlaneSelector((state) => state.threads)
  const preference = useTurnCuePreference()
  const previousRef = useRef<ReadonlyArray<TurnCueThread> | undefined>(undefined)
  const onPreference = useEffectEvent(() => preference)

  useEffect(() => {
    const previous = previousRef.current
    previousRef.current = threads
    const currentPreference = onPreference()
    if (previous === undefined || !currentPreference.enabled) {
      return
    }
    if (settledTurns(previous, threads).length === 0) {
      return
    }
    playTurnCue(currentPreference.sound)
  }, [threads])
}
