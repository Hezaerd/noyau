import { useAtomValue } from "@effect/atom-react"

import type { TurnCuePreference } from "@/lib/turn-cue-preference"
import { turnCuePreferenceAtom } from "@/state/preferences"

export const useTurnCuePreference = (): TurnCuePreference => useAtomValue(turnCuePreferenceAtom)
