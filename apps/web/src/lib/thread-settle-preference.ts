import { Option, Schema } from "effect"

export const AUTO_SETTLE_ON_MERGE_STORAGE_KEY = "noyau:auto-settle-on-merge"
export const AUTO_SETTLE_AFTER_DAYS_STORAGE_KEY = "noyau:auto-settle-after-days"
export const DEFAULT_AUTO_SETTLE_ON_MERGE = true
export const DEFAULT_AUTO_SETTLE_AFTER_DAYS = 3
export const AUTO_SETTLE_AFTER_DAYS_MIN = 1
export const AUTO_SETTLE_AFTER_DAYS_MAX = 90

const AutoSettleOnMergePreference = Schema.Literals(["on", "off"])
const decodeAutoSettleOnMergePreference = Schema.decodeUnknownOption(AutoSettleOnMergePreference)
const AutoSettleAfterDaysPreference = Schema.NullOr(
  Schema.Int.check(
    Schema.isBetween({
      minimum: AUTO_SETTLE_AFTER_DAYS_MIN,
      maximum: AUTO_SETTLE_AFTER_DAYS_MAX,
    }),
  ),
)
const decodeAutoSettleAfterDaysPreference = Schema.decodeUnknownOption(
  AutoSettleAfterDaysPreference,
)

export const parseAutoSettleOnMergeEnabled = (value: string | null): boolean =>
  Option.match(decodeAutoSettleOnMergePreference(value), {
    onNone: () => DEFAULT_AUTO_SETTLE_ON_MERGE,
    onSome: (preference) => preference === "on",
  })

export const parseAutoSettleAfterDays = (value: string | null): number | null => {
  if (value === null) {
    return DEFAULT_AUTO_SETTLE_AFTER_DAYS
  }
  if (value === "off") {
    return null
  }
  const parsed = Number.parseInt(value, 10)
  return Option.match(
    decodeAutoSettleAfterDaysPreference(Number.isFinite(parsed) ? parsed : value),
    {
      onNone: () => DEFAULT_AUTO_SETTLE_AFTER_DAYS,
      onSome: (days) => days,
    },
  )
}

export const decodeAutoSettleAfterDaysValue = (days: number): number | undefined =>
  Option.match(decodeAutoSettleAfterDaysPreference(days), {
    onNone: () => undefined,
    onSome: (value) => value ?? undefined,
  })

export const readStoredAutoSettleOnMerge = (): boolean => {
  try {
    return parseAutoSettleOnMergeEnabled(
      window.localStorage.getItem(AUTO_SETTLE_ON_MERGE_STORAGE_KEY),
    )
  } catch {
    return DEFAULT_AUTO_SETTLE_ON_MERGE
  }
}

export const readStoredAutoSettleAfterDays = (): number | null => {
  try {
    return parseAutoSettleAfterDays(window.localStorage.getItem(AUTO_SETTLE_AFTER_DAYS_STORAGE_KEY))
  } catch {
    return DEFAULT_AUTO_SETTLE_AFTER_DAYS
  }
}

export const persistAutoSettleOnMerge = (enabled: boolean): void => {
  try {
    if (enabled === DEFAULT_AUTO_SETTLE_ON_MERGE) {
      window.localStorage.removeItem(AUTO_SETTLE_ON_MERGE_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(AUTO_SETTLE_ON_MERGE_STORAGE_KEY, "off")
  } catch {
    // Preference stays in-session when storage is unavailable.
  }
}

export const persistAutoSettleAfterDays = (days: number | null): void => {
  try {
    if (days === DEFAULT_AUTO_SETTLE_AFTER_DAYS) {
      window.localStorage.removeItem(AUTO_SETTLE_AFTER_DAYS_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(
      AUTO_SETTLE_AFTER_DAYS_STORAGE_KEY,
      days === null ? "off" : String(days),
    )
  } catch {
    // Preference stays in-session when storage is unavailable.
  }
}
