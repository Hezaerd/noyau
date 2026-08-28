import { useEffect, useRef } from "react"

import { KEYBINDING_IDS, type KeybindingId } from "@/lib/keybindings-catalog"
import { registerKeybindingHandler } from "@/state/keybinding-handlers"

export const useKeybindingHandler = (
  id: KeybindingId,
  handler: () => void,
  enabled = true,
): void => {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!enabled) {
      return
    }
    return registerKeybindingHandler(id, () => {
      handlerRef.current()
    })
  }, [enabled, id])
}

export const useKeybindingHandlers = (
  handlers: Partial<Record<KeybindingId, () => void>>,
  enabled = true,
): void => {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!enabled) {
      return
    }
    const unsubscribes = KEYBINDING_IDS.flatMap((id) => {
      if (handlersRef.current[id] === undefined) {
        return []
      }
      return [
        registerKeybindingHandler(id, () => {
          handlersRef.current[id]?.()
        }),
      ]
    })
    return () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe()
      }
    }
  }, [enabled])
}
