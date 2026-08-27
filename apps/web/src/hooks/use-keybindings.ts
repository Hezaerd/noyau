import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { useMemo } from "react"

import { type KeybindingId } from "@/lib/keybindings-catalog"
import { buildKeybindingRows, type KeybindingRow } from "@/lib/keybindings-settings"
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
  const rules = useAtomValue(keybindingsRulesAtom)
  const resolved = useAtomValue(resolvedKeybindingsAtom)
  const resolvedConfig = useAtomValue(resolvedKeybindingsConfigAtom)
  const rows = useMemo(() => buildKeybindingRows(resolvedConfig, ""), [resolvedConfig])

  return useMemo(
    () => ({
      rules,
      resolved,
      resolvedConfig,
      rows,
      upsertKeybinding,
      removeKeybinding,
      resetKeybinding,
      resetAll: resetAllKeybindings,
      replaceKeybindingsRules,
    }),
    [resolved, resolvedConfig, rows, rules],
  )
}

export const useKeybinding = (id: KeybindingId) => {
  const { resolved } = useKeybindings()
  return resolved[id]
}

export const useKeybindingRecorderActive = (): boolean => useAtomValue(keybindingRecorderActiveAtom)

export const useSetKeybindingRecorderActive = () => useAtomSet(keybindingRecorderActiveAtom)

export type { KeybindingRow, ResolvedKeybindings, ResolvedKeybindingsConfig }
