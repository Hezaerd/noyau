import { useEffect } from "react"

import { isKeybindingRecorderActive } from "@/state/keybindings"

export function useSettingsEscape(onEscape: () => void): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape" || isKeybindingRecorderActive()) {
        return
      }
      event.preventDefault()
      const activeElement = document.activeElement
      if (activeElement instanceof HTMLElement) {
        activeElement.blur()
      }
      onEscape()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onEscape])
}
