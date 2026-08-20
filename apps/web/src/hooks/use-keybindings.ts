import { useMemo, useSyncExternalStore } from "react"

import {
  getResolvedKeybindings,
  resetAllKeybindings,
  resetKeybinding,
  setKeybinding,
  subscribeKeybindings,
  type ResolvedKeybindings,
} from "@/lib/keybindings"
import type { KeybindingId } from "@/lib/keybindings-catalog"

export const useKeybindings = () => {
  const resolved = useSyncExternalStore(
    subscribeKeybindings,
    getResolvedKeybindings,
    getResolvedKeybindings,
  )

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
