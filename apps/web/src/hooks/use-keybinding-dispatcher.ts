import { useEffect } from "react"

import { resolveShortcutCommand } from "@/lib/keybindings"
import { getHotkeysPlatform } from "@/lib/keyboard-shortcut"
import { readKeybindingContext } from "@/state/keybinding-context"
import { invokeKeybindingHandler } from "@/state/keybinding-handlers"
import { getResolvedKeybindingsConfig, isKeybindingRecorderActive } from "@/state/keybindings"

export const dispatchKeybindingEvent = (event: KeyboardEvent): boolean => {
  if (event.defaultPrevented || isKeybindingRecorderActive()) {
    return false
  }
  const id = resolveShortcutCommand(
    event,
    getResolvedKeybindingsConfig(),
    readKeybindingContext(event.target),
    getHotkeysPlatform(),
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
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [])
}
