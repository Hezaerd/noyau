import { useAtomSet } from "@effect/atom-react"
import { useMemo } from "react"

import { useAppAtomValue } from "@/hooks/use-app-atom"
import { type KeybindingId } from "@/lib/keybindings-catalog"
import { type KeybindingRow } from "@/lib/keybindings-settings"
import {
  keybindingRecorderActiveAtom,
  keybindingsRulesAtom,
  removeKeybinding,
  replaceKeybindingsRules,
  resetAllKeybindings,
  resetKeybinding,
  resolvedKeybindingsAtom,
  resolvedKeybindingsConfigAtom,
  upsertKeybinding,
  type ResolvedKeybindings,
  type ResolvedKeybindingsConfig,
} from "@/state/keybindings"

export const useKeybindings = () => {
  const rules = useAppAtomValue(keybindingsRulesAtom)
  const resolved = useAppAtomValue(resolvedKeybindingsAtom)
  const resolvedConfig = useAppAtomValue(resolvedKeybindingsConfigAtom)

  return useMemo(
    () => ({
      rules,
      resolved,
      resolvedConfig,
      upsertKeybinding,
      removeKeybinding,
      resetKeybinding,
      resetAll: resetAllKeybindings,
      replaceKeybindingsRules,
    }),
    [resolved, resolvedConfig, rules],
  )
}

export const useKeybinding = (id: KeybindingId) => useAppAtomValue(resolvedKeybindingsAtom)[id]

export const useKeybindingRecorderActive = (): boolean =>
  useAppAtomValue(keybindingRecorderActiveAtom)

export const useSetKeybindingRecorderActive = () => useAtomSet(keybindingRecorderActiveAtom)

export type { KeybindingRow, ResolvedKeybindings, ResolvedKeybindingsConfig }
