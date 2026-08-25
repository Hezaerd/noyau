import { Option, Schema } from "effect"

export const AUTO_REMOVE_MERGED_WORKTREE_STORAGE_KEY = "noyau:auto-remove-merged-worktree"
export const DEFAULT_AUTO_REMOVE_MERGED_WORKTREE = false

const AutoRemoveMergedWorktreePreference = Schema.Literals(["on", "off"])
const decodeAutoRemoveMergedWorktreePreference = Schema.decodeUnknownOption(
  AutoRemoveMergedWorktreePreference,
)

export const parseAutoRemoveMergedWorktreeEnabled = (value: string | null): boolean =>
  Option.match(decodeAutoRemoveMergedWorktreePreference(value), {
    onNone: () => DEFAULT_AUTO_REMOVE_MERGED_WORKTREE,
    onSome: (preference) => preference === "on",
  })

export const readStoredAutoRemoveMergedWorktree = (): boolean => {
  try {
    return parseAutoRemoveMergedWorktreeEnabled(
      window.localStorage.getItem(AUTO_REMOVE_MERGED_WORKTREE_STORAGE_KEY),
    )
  } catch {
    return DEFAULT_AUTO_REMOVE_MERGED_WORKTREE
  }
}

export const persistAutoRemoveMergedWorktree = (enabled: boolean): void => {
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
