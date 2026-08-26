import { useAtomValue } from "@effect/atom-react"

import {
  autoSettleAfterDaysAtom,
  autoSettleOnMergeAtom,
  settledShelfExpandedAtom,
} from "@/state/thread-settle"

export const useAutoSettleOnMergeEnabled = (): boolean => useAtomValue(autoSettleOnMergeAtom)

export const useAutoSettleAfterDays = (): number | null => useAtomValue(autoSettleAfterDaysAtom)

export const useSettledShelfExpanded = (): boolean => useAtomValue(settledShelfExpandedAtom)
