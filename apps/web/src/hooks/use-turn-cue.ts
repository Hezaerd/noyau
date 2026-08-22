import { useSyncExternalStore } from "react"

import {
  getTurnCuePreference,
  subscribeTurnCuePreference,
  type TurnCuePreference,
} from "@/lib/turn-cue-preference"

export const useTurnCuePreference = (): TurnCuePreference =>
  useSyncExternalStore(subscribeTurnCuePreference, getTurnCuePreference, getTurnCuePreference)
