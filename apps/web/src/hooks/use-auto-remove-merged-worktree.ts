import { useAtomValue } from "@effect/atom-react"

import { autoRemoveMergedWorktreeAtom } from "@/state/preferences"

export const useAutoRemoveMergedWorktreeEnabled = (): boolean =>
  useAtomValue(autoRemoveMergedWorktreeAtom)
