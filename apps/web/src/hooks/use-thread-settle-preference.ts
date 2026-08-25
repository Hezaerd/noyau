import { useAtomValue } from "@effect/atom-react"

import { autoSettleAfterDaysAtom, autoSettleOnMergeAtom } from "@/state/thread-settle"

export const useAutoSettleOnMergeEnabled = (): boolean => useAtomValue(autoSettleOnMergeAtom)

export const useAutoSettleAfterDays = (): number | null => useAtomValue(autoSettleAfterDaysAtom)
