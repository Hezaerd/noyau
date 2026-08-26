import type { KeybindingId } from "@/lib/keybindings-catalog"

type KeybindingHandler = () => void

const handlers = new Map<KeybindingId, KeybindingHandler>()

export const registerKeybindingHandler = (
  id: KeybindingId,
  handler: KeybindingHandler,
): (() => void) => {
  handlers.set(id, handler)
  return () => {
    if (handlers.get(id) === handler) {
      handlers.delete(id)
    }
  }
}

export const invokeKeybindingHandler = (id: KeybindingId): boolean => {
  const handler = handlers.get(id)
  if (handler === undefined) {
    return false
  }
  handler()
  return true
}

export const resetKeybindingHandlersForTests = (): void => {
  handlers.clear()
}
