import { Option, Schema } from "effect"

export const AUTO_REMOVE_MERGED_WORKTREE_STORAGE_KEY = "noyau:auto-remove-merged-worktree"
export const DEFAULT_AUTO_REMOVE_MERGED_WORKTREE = false

const AutoRemoveMergedWorktreePreference = Schema.Literals(["on", "off"])
const decodeAutoRemoveMergedWorktreePreference = Schema.decodeUnknownOption(
  AutoRemoveMergedWorktreePreference,
)

const listeners = new Set<() => void>()

let currentEnabled = DEFAULT_AUTO_REMOVE_MERGED_WORKTREE
let initialized = false

export const parseAutoRemoveMergedWorktreeEnabled = (value: string | null): boolean =>
  Option.match(decodeAutoRemoveMergedWorktreePreference(value), {
    onNone: () => DEFAULT_AUTO_REMOVE_MERGED_WORKTREE,
    onSome: (preference) => preference === "on",
  })

const readStoredPreference = (): boolean => {
  try {
    return parseAutoRemoveMergedWorktreeEnabled(
      window.localStorage.getItem(AUTO_REMOVE_MERGED_WORKTREE_STORAGE_KEY),
    )
  } catch {
    return DEFAULT_AUTO_REMOVE_MERGED_WORKTREE
  }
}

const persistPreference = (enabled: boolean): void => {
  try {
    if (enabled === DEFAULT_AUTO_REMOVE_MERGED_WORKTREE) {
      window.localStorage.removeItem(AUTO_REMOVE_MERGED_WORKTREE_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(AUTO_REMOVE_MERGED_WORKTREE_STORAGE_KEY, "on")
  } catch {
    // The preference remains active for this renderer session when storage is unavailable.
  }
}

const emitChange = (): void => {
  for (const listener of listeners) {
    listener()
  }
}

export const initializeAutoRemoveMergedWorktreePreference = (): void => {
  if (initialized) {
    return
  }
  initialized = true
  currentEnabled = readStoredPreference()
}

export const getAutoRemoveMergedWorktreeEnabled = (): boolean => currentEnabled

export const subscribeAutoRemoveMergedWorktreeEnabled = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const setAutoRemoveMergedWorktreeEnabled = (enabled: boolean): void => {
  if (enabled === currentEnabled) {
    return
  }
  currentEnabled = enabled
  persistPreference(enabled)
  emitChange()
}
