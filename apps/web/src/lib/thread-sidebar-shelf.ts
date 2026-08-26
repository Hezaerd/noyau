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

export const settledShelfLabel = (count: number): string => `Classés (${count})`

/** Collapsed shelf hides rows, except the Thread already open. */
export const settledThreadsVisibleInShelf = <T extends { readonly id: string }>(
  settled: ReadonlyArray<T>,
  options: { readonly expanded: boolean; readonly openThreadId: string | null },
): ReadonlyArray<T> => {
  if (options.expanded) {
    return settled
  }
  if (options.openThreadId === null) {
    return []
  }
  const open = settled.find((thread) => thread.id === options.openThreadId)
  return open === undefined ? [] : [open]
}
