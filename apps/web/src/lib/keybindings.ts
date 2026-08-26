import {
  matchesKeyboardEvent,
  normalizeHotkey,
  validateHotkey,
  type Hotkey,
} from "@tanstack/react-hotkeys"
import { Option, Schema } from "effect"

import {
  keybindingConditionSpecificity,
  keybindingConditionsOverlap,
  matchKeybindingCondition,
  type KeybindingConditionSnapshot,
} from "@/lib/keybinding-when"
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
  readonly "settings.open": Hotkey
  readonly "thread.create": Hotkey
  readonly "thread.rename": Hotkey
  readonly "thread.pin": Hotkey
  readonly "thread.settle": Hotkey
  readonly "thread.model-picker.open": Hotkey
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
export const emptyKeybindingOverrides = (): Map<KeybindingId, Hotkey> => new Map()

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
    return emptyKeybindingOverrides()
  }

  const overrides = emptyKeybindingOverrides()
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

export const resolveKeybindings = (overrides: KeybindingOverrides): ResolvedKeybindings => ({
  "palette.open": overrides.get("palette.open") ?? defaultKeybinding("palette.open"),
  "settings.open": overrides.get("settings.open") ?? defaultKeybinding("settings.open"),
  "thread.create": overrides.get("thread.create") ?? defaultKeybinding("thread.create"),
  "thread.rename": overrides.get("thread.rename") ?? defaultKeybinding("thread.rename"),
  "thread.pin": overrides.get("thread.pin") ?? defaultKeybinding("thread.pin"),
  "thread.settle": overrides.get("thread.settle") ?? defaultKeybinding("thread.settle"),
  "thread.model-picker.open":
    overrides.get("thread.model-picker.open") ?? defaultKeybinding("thread.model-picker.open"),
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

export const resolveKeybinding = (id: KeybindingId, overrides: KeybindingOverrides): Hotkey =>
  overrides.get(id) ?? defaultKeybinding(id)

export const keybindingConflicts = (
  id: KeybindingId,
  hotkey: string,
  resolved: ResolvedKeybindings,
  platform: HotkeysPlatform = currentPlatform(),
): ReadonlyArray<KeybindingId> => {
  const canonical = canonicalizeHotkey(hotkey, platform)
  if (canonical === undefined) {
    return []
  }
  const when = getKeybindingDefinition(id).when
  return KEYBINDING_IDS.filter((candidate) => {
    if (candidate === id || resolved[candidate] !== canonical) {
      return false
    }
    return keybindingConditionsOverlap(when, getKeybindingDefinition(candidate).when)
  })
}

export const resolveMatchingKeybinding = (
  event: KeyboardEvent,
  resolved: ResolvedKeybindings,
  snapshot: KeybindingConditionSnapshot,
  platform: HotkeysPlatform = currentPlatform(),
): KeybindingId | undefined => {
  const matches = KEYBINDING_IDS.filter((id) => {
    if (!matchesKeyboardEvent(event, resolved[id], platform)) {
      return false
    }
    return matchKeybindingCondition(getKeybindingDefinition(id).when, snapshot)
  })
  if (matches.length === 0) {
    return undefined
  }
  return matches.toSorted(
    (left, right) =>
      keybindingConditionSpecificity(getKeybindingDefinition(right).when) -
      keybindingConditionSpecificity(getKeybindingDefinition(left).when),
  )[0]
}

export const matchesKeybinding = (
  event: KeyboardEvent,
  id: KeybindingId,
  resolved: ResolvedKeybindings,
  platform: HotkeysPlatform = currentPlatform(),
): boolean => matchesKeyboardEvent(event, resolved[id], platform)

export const readStoredKeybindingOverrides = (): Map<KeybindingId, Hotkey> => {
  try {
    return new Map(parseKeybindingOverrides(window.localStorage.getItem(KEYBINDINGS_STORAGE_KEY)))
  } catch {
    return emptyKeybindingOverrides()
  }
}

export const persistKeybindingOverrides = (overrides: KeybindingOverrides): void => {
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

export const hasCustomKeybindings = (overrides: KeybindingOverrides): boolean => overrides.size > 0

export const isCustomKeybinding = (id: KeybindingId, overrides: KeybindingOverrides): boolean =>
  overrides.has(id)
