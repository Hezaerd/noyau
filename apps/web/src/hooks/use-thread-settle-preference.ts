import { useAppAtomValue } from "@/hooks/use-app-atom"
import {
  autoSettleAfterDaysAtom,
  autoSettleOnMergeAtom,
  settledShelfExpandedAtom,
} from "@/state/thread-settle"

export const useAutoSettleOnMergeEnabled = (): boolean => useAppAtomValue(autoSettleOnMergeAtom)

export const useAutoSettleAfterDays = (): number | null => useAppAtomValue(autoSettleAfterDaysAtom)

export const useSettledShelfExpanded = (): boolean => useAppAtomValue(settledShelfExpandedAtom)
