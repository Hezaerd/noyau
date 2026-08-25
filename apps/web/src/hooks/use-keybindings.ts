import { useAtomValue } from "@effect/atom-react"
import { useMemo } from "react"

import type { KeybindingId } from "@/lib/keybindings-catalog"
import {
  resetAllKeybindings,
  resetKeybinding,
  resolvedKeybindingsAtom,
  setKeybinding,
  type ResolvedKeybindings,
} from "@/state/keybindings"

export const useKeybindings = () => {
  const resolved = useAtomValue(resolvedKeybindingsAtom)

  return useMemo(
    () => ({
      resolved,
      setKeybinding,
      resetKeybinding,
      resetAll: resetAllKeybindings,
    }),
    [resolved],
  )
}

export const useKeybinding = (id: KeybindingId) => {
  const { resolved } = useKeybindings()
  return resolved[id]
}

export type { ResolvedKeybindings }
