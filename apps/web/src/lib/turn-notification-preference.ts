import { Option, Schema } from "effect"

export const TURN_NOTIFICATION_STORAGE_KEY = "noyau:turn-notification"
export const DEFAULT_TURN_NOTIFICATION_ENABLED = true

const TurnNotificationPreference = Schema.Literals(["on", "off"])
const decodeTurnNotificationPreference = Schema.decodeUnknownOption(TurnNotificationPreference)

export const parseTurnNotificationEnabled = (value: string | null): boolean =>
  Option.match(decodeTurnNotificationPreference(value), {
    onNone: () => DEFAULT_TURN_NOTIFICATION_ENABLED,
    onSome: (preference) => preference === "on",
  })

export const readStoredTurnNotificationEnabled = (): boolean => {
  try {
    return parseTurnNotificationEnabled(window.localStorage.getItem(TURN_NOTIFICATION_STORAGE_KEY))
  } catch {
    return DEFAULT_TURN_NOTIFICATION_ENABLED
  }
}

export const persistTurnNotificationEnabled = (enabled: boolean): void => {
  try {
    if (enabled === DEFAULT_TURN_NOTIFICATION_ENABLED) {
      window.localStorage.removeItem(TURN_NOTIFICATION_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(TURN_NOTIFICATION_STORAGE_KEY, "off")
  } catch {
    // The preference remains active for this renderer session when storage is unavailable.
  }
}
