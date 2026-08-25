import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { useMemo } from "react"

import { isCustomKeybinding as isCustomKeybindingIn } from "@/lib/keybindings"
import type { KeybindingId } from "@/lib/keybindings-catalog"
import {
  keybindingOverridesAtom,
  keybindingRecorderActiveAtom,
  resetAllKeybindings,
  resetKeybinding,
  resolvedKeybindingsAtom,
  setKeybinding,
  type ResolvedKeybindings,
} from "@/state/keybindings"

export const useKeybindings = () => {
  const resolved = useAtomValue(resolvedKeybindingsAtom)
  const overrides = useAtomValue(keybindingOverridesAtom)

  return useMemo(
    () => ({
      resolved,
      setKeybinding,
      resetKeybinding,
      resetAll: resetAllKeybindings,
      isCustom: (id: KeybindingId) => isCustomKeybindingIn(id, overrides),
    }),
    [overrides, resolved],
  )
}

export const useKeybinding = (id: KeybindingId) => {
  const { resolved } = useKeybindings()
  return resolved[id]
}

export const useKeybindingRecorderActive = (): boolean => useAtomValue(keybindingRecorderActiveAtom)

export const useSetKeybindingRecorderActive = () => useAtomSet(keybindingRecorderActiveAtom)

export type { ResolvedKeybindings }
