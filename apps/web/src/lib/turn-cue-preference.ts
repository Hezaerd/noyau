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

const listeners = new Set<() => void>()

let current: TurnCuePreference = {
  enabled: DEFAULT_TURN_CUE_ENABLED,
  sound: DEFAULT_TURN_CUE_SOUND,
}
let initialized = false

export const parseTurnCueEnabled = (value: string | null): boolean =>
  Option.match(decodeTurnCueEnabledPreference(value), {
    onNone: () => DEFAULT_TURN_CUE_ENABLED,
    onSome: (preference) => preference === "on",
  })

export const parseTurnCueSound = (value: string | null): TurnCueSound =>
  value !== null && isTurnCueSound(value) ? value : DEFAULT_TURN_CUE_SOUND

const readStoredPreference = (): TurnCuePreference => {
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

const persistPreference = (preference: TurnCuePreference): void => {
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

const emitChange = (): void => {
  for (const listener of listeners) {
    listener()
  }
}

const replacePreference = (next: TurnCuePreference): void => {
  if (current.enabled === next.enabled && current.sound === next.sound) {
    return
  }
  current = next
  persistPreference(next)
  emitChange()
}

export const initializeTurnCuePreference = (): void => {
  if (initialized) {
    return
  }
  initialized = true
  current = readStoredPreference()
}

export const getTurnCuePreference = (): TurnCuePreference => current

export const subscribeTurnCuePreference = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const setTurnCueEnabled = (enabled: boolean): void => {
  replacePreference({ enabled, sound: current.sound })
}

export const setTurnCueSound = (sound: TurnCueSound): void => {
  replacePreference({ enabled: current.enabled, sound })
}

export const resetTurnCuePreference = (): void => {
  replacePreference({
    enabled: DEFAULT_TURN_CUE_ENABLED,
    sound: DEFAULT_TURN_CUE_SOUND,
  })
}

export const isTurnCuePreferenceDefault = (preference: TurnCuePreference): boolean =>
  preference.enabled === DEFAULT_TURN_CUE_ENABLED && preference.sound === DEFAULT_TURN_CUE_SOUND
