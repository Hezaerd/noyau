import { useSyncExternalStore } from "react"

import {
  getAutoSettleAfterDays,
  getAutoSettleOnMergeEnabled,
  subscribeThreadSettlePreference,
} from "@/lib/thread-settle-preference"

export const useAutoSettleOnMergeEnabled = (): boolean =>
  useSyncExternalStore(
    subscribeThreadSettlePreference,
    getAutoSettleOnMergeEnabled,
    getAutoSettleOnMergeEnabled,
  )

export const useAutoSettleAfterDays = (): number | null =>
  useSyncExternalStore(
    subscribeThreadSettlePreference,
    getAutoSettleAfterDays,
    getAutoSettleAfterDays,
  )
