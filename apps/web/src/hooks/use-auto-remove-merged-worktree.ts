import { useSyncExternalStore } from "react"

import {
  getAutoRemoveMergedWorktreeEnabled,
  subscribeAutoRemoveMergedWorktreeEnabled,
} from "@/lib/auto-remove-merged-worktree-preference"

export const useAutoRemoveMergedWorktreeEnabled = (): boolean =>
  useSyncExternalStore(
    subscribeAutoRemoveMergedWorktreeEnabled,
    getAutoRemoveMergedWorktreeEnabled,
    getAutoRemoveMergedWorktreeEnabled,
  )
