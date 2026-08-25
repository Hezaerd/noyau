import { Option, Schema } from "effect"

export const DISCORD_PRESENCE_STORAGE_KEY = "noyau:discord-rich-presence"
export const DEFAULT_DISCORD_PRESENCE_ENABLED = true

const DiscordPresencePreference = Schema.Literals(["on", "off"])
const decodeDiscordPresencePreference = Schema.decodeUnknownOption(DiscordPresencePreference)

export const parseDiscordPresenceEnabled = (value: string | null): boolean =>
  Option.match(decodeDiscordPresencePreference(value), {
    onNone: () => DEFAULT_DISCORD_PRESENCE_ENABLED,
    onSome: (preference) => preference === "on",
  })

export const readStoredDiscordPresence = (): boolean => {
  try {
    return parseDiscordPresenceEnabled(window.localStorage.getItem(DISCORD_PRESENCE_STORAGE_KEY))
  } catch {
    return DEFAULT_DISCORD_PRESENCE_ENABLED
  }
}

export const persistDiscordPresence = (enabled: boolean): void => {
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
