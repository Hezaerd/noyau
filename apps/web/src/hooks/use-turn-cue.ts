import { useAppAtomValue } from "@/hooks/use-app-atom"
import type { TurnCuePreference } from "@/lib/turn-cue-preference"
import { turnCuePreferenceAtom } from "@/state/preferences"

export const useTurnCuePreference = (): TurnCuePreference => useAppAtomValue(turnCuePreferenceAtom)
