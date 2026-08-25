import { Option, Schema } from "effect"

import { DEFAULT_TURN_CUE_SOUND, isTurnCueSound, type TurnCueSound } from "@/lib/turn-cue"

export const TURN_CUE_ENABLED_STORAGE_KEY = "noyau:turn-cue"
export const TURN_CUE_SOUND_STORAGE_KEY = "noyau:turn-cue-sound"
export const DEFAULT_TURN_CUE_ENABLED = true

export interface TurnCuePreference {
  readonly enabled: boolean
  readonly sound: TurnCueSound
}

const TurnCueEnabledPreference = Schema.Literals(["on", "off"])
const decodeTurnCueEnabledPreference = Schema.decodeUnknownOption(TurnCueEnabledPreference)

export const parseTurnCueEnabled = (value: string | null): boolean =>
  Option.match(decodeTurnCueEnabledPreference(value), {
    onNone: () => DEFAULT_TURN_CUE_ENABLED,
    onSome: (preference) => preference === "on",
  })

export const parseTurnCueSound = (value: string | null): TurnCueSound =>
  value !== null && isTurnCueSound(value) ? value : DEFAULT_TURN_CUE_SOUND

export const readStoredTurnCuePreference = (): TurnCuePreference => {
  try {
    return {
      enabled: parseTurnCueEnabled(window.localStorage.getItem(TURN_CUE_ENABLED_STORAGE_KEY)),
      sound: parseTurnCueSound(window.localStorage.getItem(TURN_CUE_SOUND_STORAGE_KEY)),
    }
  } catch {
    return {
      enabled: DEFAULT_TURN_CUE_ENABLED,
      sound: DEFAULT_TURN_CUE_SOUND,
    }
  }
}

export const persistTurnCuePreference = (preference: TurnCuePreference): void => {
  try {
    if (preference.enabled === DEFAULT_TURN_CUE_ENABLED) {
      window.localStorage.removeItem(TURN_CUE_ENABLED_STORAGE_KEY)
    } else {
      window.localStorage.setItem(TURN_CUE_ENABLED_STORAGE_KEY, preference.enabled ? "on" : "off")
    }
    if (preference.sound === DEFAULT_TURN_CUE_SOUND) {
      window.localStorage.removeItem(TURN_CUE_SOUND_STORAGE_KEY)
    } else {
      window.localStorage.setItem(TURN_CUE_SOUND_STORAGE_KEY, preference.sound)
    }
  } catch {
    // The preference remains active for this renderer session when storage is unavailable.
  }
}

export const isTurnCuePreferenceDefault = (preference: TurnCuePreference): boolean =>
  preference.enabled === DEFAULT_TURN_CUE_ENABLED && preference.sound === DEFAULT_TURN_CUE_SOUND
