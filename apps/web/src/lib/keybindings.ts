import {
  matchesKeyboardEvent,
  normalizeHotkey,
  validateHotkey,
  type Hotkey,
} from "@tanstack/react-hotkeys"
import { Option, Schema } from "effect"

import {
  defaultKeybinding,
  getKeybindingDefinition,
  isKeybindingId,
  KEYBINDING_IDS,
  type KeybindingId,
} from "@/lib/keybindings-catalog"
import { getHotkeysPlatform, type HotkeysPlatform } from "@/lib/keyboard-shortcut"

export type KeybindingOverrides = ReadonlyMap<KeybindingId, Hotkey>

export interface ResolvedKeybindings {
  readonly "palette.open": Hotkey
  readonly "board.search": Hotkey
  readonly "board.ticket.create": Hotkey
  readonly "board.ticket.open": Hotkey
  readonly "board.ticket.rename": Hotkey
  readonly "board.column.rename": Hotkey
  readonly "board.navigate.up": Hotkey
  readonly "board.navigate.down": Hotkey
  readonly "board.navigate.left": Hotkey
  readonly "board.navigate.right": Hotkey
  readonly "board.move.up": Hotkey
  readonly "board.move.down": Hotkey
  readonly "board.move.left": Hotkey
  readonly "board.move.right": Hotkey
  readonly "settings.search": Hotkey
}

const KEYBINDINGS_STORAGE_KEY = "noyau:keybindings"
const KeybindingOverridesJson = Schema.fromJsonString(Schema.Record(Schema.String, Schema.String))
const decodeKeybindingOverridesJson = Schema.decodeUnknownOption(KeybindingOverridesJson)
const encodeKeybindingOverridesJson = Schema.encodeSync(KeybindingOverridesJson)
const listeners = new Set<() => void>()

const emptyOverrides = (): Map<KeybindingId, Hotkey> => new Map()

let currentOverrides: Map<KeybindingId, Hotkey> = emptyOverrides()
let initialized = false
let recorderActive = false

const currentPlatform = (): HotkeysPlatform => getHotkeysPlatform()

export const canonicalizeHotkey = (
  hotkey: string,
  platform: HotkeysPlatform = currentPlatform(),
): Hotkey | undefined => {
  const validation = validateHotkey(hotkey)
  if (
    !validation.valid ||
    validation.warnings.some((warning) => warning.startsWith("Unknown key:"))
  ) {
    return undefined
  }
  return normalizeHotkey(hotkey, platform)
}

export const parseKeybindingOverrides = (
  value: string | null,
  platform: HotkeysPlatform = currentPlatform(),
): KeybindingOverrides => {
  const decoded = decodeKeybindingOverridesJson(value ?? "{}")
  if (Option.isNone(decoded)) {
    return emptyOverrides()
  }

  const overrides = emptyOverrides()
  for (const [id, hotkey] of Object.entries(decoded.value)) {
    if (!isKeybindingId(id)) {
      continue
    }
    const canonical = canonicalizeHotkey(hotkey, platform)
    if (canonical === undefined || canonical === defaultKeybinding(id)) {
      continue
    }
    overrides.set(id, canonical)
  }
  return overrides
}

export const serializeKeybindingOverrides = (overrides: KeybindingOverrides): string =>
  encodeKeybindingOverridesJson(Object.fromEntries(overrides))

export const resolveKeybindings = (
  overrides: KeybindingOverrides = currentOverrides,
): ResolvedKeybindings => ({
  "palette.open": overrides.get("palette.open") ?? defaultKeybinding("palette.open"),
  "board.search": overrides.get("board.search") ?? defaultKeybinding("board.search"),
  "board.ticket.create":
    overrides.get("board.ticket.create") ?? defaultKeybinding("board.ticket.create"),
  "board.ticket.open": overrides.get("board.ticket.open") ?? defaultKeybinding("board.ticket.open"),
  "board.ticket.rename":
    overrides.get("board.ticket.rename") ?? defaultKeybinding("board.ticket.rename"),
  "board.column.rename":
    overrides.get("board.column.rename") ?? defaultKeybinding("board.column.rename"),
  "board.navigate.up": overrides.get("board.navigate.up") ?? defaultKeybinding("board.navigate.up"),
  "board.navigate.down":
    overrides.get("board.navigate.down") ?? defaultKeybinding("board.navigate.down"),
  "board.navigate.left":
    overrides.get("board.navigate.left") ?? defaultKeybinding("board.navigate.left"),
  "board.navigate.right":
    overrides.get("board.navigate.right") ?? defaultKeybinding("board.navigate.right"),
  "board.move.up": overrides.get("board.move.up") ?? defaultKeybinding("board.move.up"),
  "board.move.down": overrides.get("board.move.down") ?? defaultKeybinding("board.move.down"),
  "board.move.left": overrides.get("board.move.left") ?? defaultKeybinding("board.move.left"),
  "board.move.right": overrides.get("board.move.right") ?? defaultKeybinding("board.move.right"),
  "settings.search": overrides.get("settings.search") ?? defaultKeybinding("settings.search"),
})

let resolvedSnapshot = resolveKeybindings(emptyOverrides())

const refreshResolvedSnapshot = (): void => {
  resolvedSnapshot = resolveKeybindings(currentOverrides)
}

export const resolveKeybinding = (
  id: KeybindingId,
  overrides: KeybindingOverrides = currentOverrides,
): Hotkey => overrides.get(id) ?? defaultKeybinding(id)

export const keybindingConflicts = (
  id: KeybindingId,
  hotkey: string,
  resolved: ResolvedKeybindings = resolveKeybindings(),
  platform: HotkeysPlatform = currentPlatform(),
): ReadonlyArray<KeybindingId> => {
  const canonical = canonicalizeHotkey(hotkey, platform)
  if (canonical === undefined) {
    return []
  }
  const group = getKeybindingDefinition(id).group
  return KEYBINDING_IDS.filter((candidate) => {
    if (candidate === id || resolved[candidate] !== canonical) {
      return false
    }
    const candidateGroup = getKeybindingDefinition(candidate).group
    return group === candidateGroup || group === "global" || candidateGroup === "global"
  })
}

export const matchesKeybinding = (
  event: KeyboardEvent,
  id: KeybindingId,
  resolved: ResolvedKeybindings = resolveKeybindings(),
  platform: HotkeysPlatform = currentPlatform(),
): boolean => matchesKeyboardEvent(event, resolved[id], platform)

const readStoredOverrides = (): Map<KeybindingId, Hotkey> => {
  try {
    return new Map(parseKeybindingOverrides(window.localStorage.getItem(KEYBINDINGS_STORAGE_KEY)))
  } catch {
    return emptyOverrides()
  }
}

const persistOverrides = (overrides: KeybindingOverrides): void => {
  try {
    if (overrides.size === 0) {
      window.localStorage.removeItem(KEYBINDINGS_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(KEYBINDINGS_STORAGE_KEY, serializeKeybindingOverrides(overrides))
  } catch {
    // Overrides remain active for this renderer session when storage is unavailable.
  }
}

const emitChange = (): void => {
  refreshResolvedSnapshot()
  for (const listener of listeners) {
    listener()
  }
}

export const initializeKeybindings = (): void => {
  if (initialized) {
    return
  }
  initialized = true
  currentOverrides = readStoredOverrides()
  refreshResolvedSnapshot()
}

export const getKeybindingOverrides = (): KeybindingOverrides => currentOverrides

export const getResolvedKeybindings = (): ResolvedKeybindings => resolvedSnapshot

export const getKeybinding = (id: KeybindingId): Hotkey => resolveKeybinding(id, currentOverrides)

export const hasCustomKeybindings = (overrides: KeybindingOverrides = currentOverrides): boolean =>
  overrides.size > 0

export const isCustomKeybinding = (
  id: KeybindingId,
  overrides: KeybindingOverrides = currentOverrides,
): boolean => overrides.has(id)

export const subscribeKeybindings = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const setKeybinding = (
  id: KeybindingId,
  hotkey: string,
  platform: HotkeysPlatform = currentPlatform(),
): void => {
  const canonical = canonicalizeHotkey(hotkey, platform)
  if (canonical === undefined) {
    return
  }

  const next = new Map(currentOverrides)
  if (canonical === defaultKeybinding(id)) {
    next.delete(id)
  } else {
    next.set(id, canonical)
  }
  currentOverrides = next
  persistOverrides(next)
  emitChange()
}

export const resetKeybinding = (id: KeybindingId): void => {
  if (!currentOverrides.has(id)) {
    return
  }
  const next = new Map(currentOverrides)
  next.delete(id)
  currentOverrides = next
  persistOverrides(next)
  emitChange()
}

export const resetAllKeybindings = (): void => {
  if (!hasCustomKeybindings(currentOverrides)) {
    return
  }
  currentOverrides = emptyOverrides()
  persistOverrides(currentOverrides)
  emitChange()
}

export const isKeybindingRecorderActive = (): boolean => recorderActive

export const setKeybindingRecorderActive = (active: boolean): void => {
  recorderActive = active
}
