import { Option, Schema } from "effect"

export const SETTLED_SHELF_EXPANDED_STORAGE_KEY = "noyau:settled-shelf-expanded"
export const DEFAULT_SETTLED_SHELF_EXPANDED = false

const SettledShelfExpandedPreference = Schema.Literals(["on", "off"])
const decodeSettledShelfExpandedPreference = Schema.decodeUnknownOption(
  SettledShelfExpandedPreference,
)

export const parseSettledShelfExpanded = (value: string | null): boolean =>
  Option.match(decodeSettledShelfExpandedPreference(value), {
    onNone: () => DEFAULT_SETTLED_SHELF_EXPANDED,
    onSome: (preference) => preference === "on",
  })

export const readStoredSettledShelfExpanded = (): boolean => {
  try {
    return parseSettledShelfExpanded(
      window.localStorage.getItem(SETTLED_SHELF_EXPANDED_STORAGE_KEY),
    )
  } catch {
    return DEFAULT_SETTLED_SHELF_EXPANDED
  }
}

export const persistSettledShelfExpanded = (expanded: boolean): void => {
  try {
    if (expanded === DEFAULT_SETTLED_SHELF_EXPANDED) {
      window.localStorage.removeItem(SETTLED_SHELF_EXPANDED_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(SETTLED_SHELF_EXPANDED_STORAGE_KEY, "on")
  } catch {
    // Preference stays in-session when storage is unavailable.
  }
}

export const settledShelfLabel = (count: number): string => `Settled (${count})`

/** Collapsed shelf hides every row. Only the header toggle opens it. */
export const settledThreadsVisibleInShelf = <T>(
  settled: ReadonlyArray<T>,
  expanded: boolean,
): ReadonlyArray<T> => (expanded ? settled : [])
