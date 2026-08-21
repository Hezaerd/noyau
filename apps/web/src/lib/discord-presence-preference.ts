import { Option, Schema } from "effect"

export const DISCORD_PRESENCE_STORAGE_KEY = "noyau:discord-rich-presence"
export const DEFAULT_DISCORD_PRESENCE_ENABLED = true

const DiscordPresencePreference = Schema.Literals(["on", "off"])
const decodeDiscordPresencePreference = Schema.decodeUnknownOption(DiscordPresencePreference)

const listeners = new Set<() => void>()

let currentEnabled = DEFAULT_DISCORD_PRESENCE_ENABLED
let initialized = false

export const parseDiscordPresenceEnabled = (value: string | null): boolean =>
  Option.match(decodeDiscordPresencePreference(value), {
    onNone: () => DEFAULT_DISCORD_PRESENCE_ENABLED,
    onSome: (preference) => preference === "on",
  })

const readStoredPreference = (): boolean => {
  try {
    return parseDiscordPresenceEnabled(window.localStorage.getItem(DISCORD_PRESENCE_STORAGE_KEY))
  } catch {
    return DEFAULT_DISCORD_PRESENCE_ENABLED
  }
}

const persistPreference = (enabled: boolean): void => {
  try {
    if (enabled === DEFAULT_DISCORD_PRESENCE_ENABLED) {
      window.localStorage.removeItem(DISCORD_PRESENCE_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(DISCORD_PRESENCE_STORAGE_KEY, "off")
  } catch {
    // The preference remains active for this renderer session when storage is unavailable.
  }
}

const emitChange = (): void => {
  for (const listener of listeners) {
    listener()
  }
}

export const initializeDiscordPresencePreference = (): void => {
  if (initialized) {
    return
  }
  initialized = true
  currentEnabled = readStoredPreference()
}

export const getDiscordPresenceEnabled = (): boolean => currentEnabled

export const subscribeDiscordPresenceEnabled = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const setDiscordPresenceEnabled = (enabled: boolean): void => {
  if (enabled === currentEnabled) {
    return
  }
  currentEnabled = enabled
  persistPreference(enabled)
  emitChange()
}
