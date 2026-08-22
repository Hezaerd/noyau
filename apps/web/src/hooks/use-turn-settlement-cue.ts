import { useEffect, useRef } from "react"

import { useControlPlane } from "@/hooks/use-control-plane"
import { useTurnCuePreference } from "@/hooks/use-turn-cue"
import { playTurnCue, settledTurns, type TurnCueThread } from "@/lib/turn-cue"

export const useTurnSettlementCue = (): void => {
  const { shell } = useControlPlane()
  const preference = useTurnCuePreference()
  const previousRef = useRef<ReadonlyArray<TurnCueThread> | undefined>(undefined)
  const preferenceRef = useRef(preference)
  preferenceRef.current = preference

  const threads = shell?.threads

  useEffect(() => {
    if (threads === undefined) {
      return
    }
    const previous = previousRef.current
    previousRef.current = threads
    if (previous === undefined || !preferenceRef.current.enabled) {
      return
    }
    if (settledTurns(previous, threads).length === 0) {
      return
    }
    playTurnCue(preferenceRef.current.sound)
  }, [threads])
}
