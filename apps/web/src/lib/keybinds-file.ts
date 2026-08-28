import { Option, Schema } from "effect"

import { MAX_KEYBINDING_WHEN_LENGTH, parseKeybindingWhenExpression } from "@/lib/keybinding-when"
import {
  isKeybindingTombstone,
  parseKeybindingShortcut,
  shortcutToKeybindingInput,
  type KeybindingRule,
} from "@/lib/keybindings"
import { DEFAULT_KEYBINDING_RULES, isKeybindingId } from "@/lib/keybindings-catalog"

export const KEYBINDINGS_FILE_NAME = "keybindings.json"
const KEYBINDS_STORAGE_KEY = "noyau:keybindings"

const KeybindingRuleJson = Schema.Struct({
  key: Schema.String,
  command: Schema.String,
  when: Schema.optionalKey(Schema.String),
})
const KeybindingsFileJson = Schema.Array(KeybindingRuleJson)
const decodeKeybindingsFileJson = Schema.decodeUnknownOption(
  Schema.fromJsonString(KeybindingsFileJson),
)
const encodeKeybindingsFile = Schema.encodeSync(KeybindingsFileJson)

const decodeStoredRule = (entry: typeof KeybindingRuleJson.Type): KeybindingRule | undefined => {
  if (!isKeybindingId(entry.command)) {
    return undefined
  }
  const raw: KeybindingRule =
    entry.when === undefined
      ? { key: entry.key, command: entry.command }
      : { key: entry.key, command: entry.command, when: entry.when }
  if (isKeybindingTombstone(raw)) {
    return raw
  }
  const shortcut = parseKeybindingShortcut(entry.key)
  if (shortcut === null) {
    return undefined
  }
  const key = shortcutToKeybindingInput(shortcut)
  if (entry.when === undefined) {
    return { key, command: entry.command }
  }
  if (
    entry.when.length > MAX_KEYBINDING_WHEN_LENGTH ||
    parseKeybindingWhenExpression(entry.when) === null
  ) {
    return undefined
  }
  return { key, command: entry.command, when: entry.when }
}

export const parseKeybindingsRules = (value: string | null): ReadonlyArray<KeybindingRule> => {
  if (value === null || value.trim() === "") {
    return []
  }
  const decoded = decodeKeybindingsFileJson(value)
  if (Option.isNone(decoded)) {
    return []
  }
  return decoded.value.flatMap((entry) => {
    const rule = decodeStoredRule(entry)
    return rule === undefined ? [] : [rule]
  })
}

export const serializeKeybindingsRules = (rules: ReadonlyArray<KeybindingRule>): string =>
  `${JSON.stringify(encodeKeybindingsFile(rules), null, 2)}\n`

export const hasKeybindingsEdits = (rules: ReadonlyArray<KeybindingRule>): boolean =>
  rules.length > 0

export const readStoredKeybindingsRules = (): ReadonlyArray<KeybindingRule> => {
  try {
    return parseKeybindingsRules(window.localStorage.getItem(KEYBINDS_STORAGE_KEY))
  } catch {
    return []
  }
}

export const persistKeybindingsRules = (rules: ReadonlyArray<KeybindingRule>): void => {
  try {
    if (rules.length === 0) {
      window.localStorage.removeItem(KEYBINDS_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(KEYBINDS_STORAGE_KEY, serializeKeybindingsRules(rules))
  } catch {
    // Edits remain active for this renderer session when storage is unavailable.
  }
}

export const downloadKeybindingsRules = (rules: ReadonlyArray<KeybindingRule>): void => {
  const payload = rules.length === 0 ? DEFAULT_KEYBINDING_RULES : rules
  const blob = new Blob([serializeKeybindingsRules(payload)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = window.document.createElement("a")
  link.href = url
  link.download = KEYBINDINGS_FILE_NAME
  link.click()
  window.setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}
