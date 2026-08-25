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

const listeners = new Set<() => void>()

let currentAutoSettleOnMerge = DEFAULT_AUTO_SETTLE_ON_MERGE
let currentAutoSettleAfterDays: number | null = DEFAULT_AUTO_SETTLE_AFTER_DAYS
let initialized = false

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

const readStoredOnMerge = (): boolean => {
  try {
    return parseAutoSettleOnMergeEnabled(
      window.localStorage.getItem(AUTO_SETTLE_ON_MERGE_STORAGE_KEY),
    )
  } catch {
    return DEFAULT_AUTO_SETTLE_ON_MERGE
  }
}

const readStoredAfterDays = (): number | null => {
  try {
    return parseAutoSettleAfterDays(window.localStorage.getItem(AUTO_SETTLE_AFTER_DAYS_STORAGE_KEY))
  } catch {
    return DEFAULT_AUTO_SETTLE_AFTER_DAYS
  }
}

const persistOnMerge = (enabled: boolean): void => {
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

const persistAfterDays = (days: number | null): void => {
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

const emitChange = (): void => {
  for (const listener of listeners) {
    listener()
  }
}

export const initializeThreadSettlePreference = (): void => {
  if (initialized) {
    return
  }
  initialized = true
  currentAutoSettleOnMerge = readStoredOnMerge()
  currentAutoSettleAfterDays = readStoredAfterDays()
}

export const getAutoSettleOnMergeEnabled = (): boolean => currentAutoSettleOnMerge
export const getAutoSettleAfterDays = (): number | null => currentAutoSettleAfterDays

export const subscribeThreadSettlePreference = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const setAutoSettleOnMergeEnabled = (enabled: boolean): void => {
  if (enabled === currentAutoSettleOnMerge) {
    return
  }
  currentAutoSettleOnMerge = enabled
  persistOnMerge(enabled)
  emitChange()
}

export const setAutoSettleAfterDays = (days: number | null): void => {
  const next =
    days === null
      ? null
      : Option.match(decodeAutoSettleAfterDaysPreference(days), {
          onNone: () => currentAutoSettleAfterDays,
          onSome: (value) => value,
        })
  if (next === currentAutoSettleAfterDays) {
    return
  }
  currentAutoSettleAfterDays = next
  persistAfterDays(next)
  emitChange()
}

export const isThreadSettlePreferenceDefault = (): boolean =>
  currentAutoSettleOnMerge === DEFAULT_AUTO_SETTLE_ON_MERGE &&
  currentAutoSettleAfterDays === DEFAULT_AUTO_SETTLE_AFTER_DAYS

export const resetThreadSettlePreference = (): void => {
  currentAutoSettleOnMerge = DEFAULT_AUTO_SETTLE_ON_MERGE
  currentAutoSettleAfterDays = DEFAULT_AUTO_SETTLE_AFTER_DAYS
  persistOnMerge(DEFAULT_AUTO_SETTLE_ON_MERGE)
  persistAfterDays(DEFAULT_AUTO_SETTLE_AFTER_DAYS)
  emitChange()
}
