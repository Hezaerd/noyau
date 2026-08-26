import { useEffect } from "react"

import { resolveMatchingKeybinding } from "@/lib/keybindings"
import { readKeybindingConditionSnapshot } from "@/state/keybinding-context"
import { invokeKeybindingHandler } from "@/state/keybinding-handlers"
import { getResolvedKeybindings, isKeybindingRecorderActive } from "@/state/keybindings"

export const dispatchKeybindingEvent = (event: KeyboardEvent): boolean => {
  if (event.defaultPrevented || isKeybindingRecorderActive()) {
    return false
  }
  const id = resolveMatchingKeybinding(
    event,
    getResolvedKeybindings(),
    readKeybindingConditionSnapshot(event),
  )
  if (id === undefined) {
    return false
  }
  event.preventDefault()
  invokeKeybindingHandler(id)
  return true
}

export const useKeybindingDispatcher = (): void => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      dispatchKeybindingEvent(event)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])
}
