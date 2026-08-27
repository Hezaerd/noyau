import {
  matchesWhenClause,
  parseKeybindingWhenExpression,
  whenAstToExpression,
  type KeybindingContext,
  type KeybindingWhenNode,
} from "@/lib/keybinding-when"
import {
  DEFAULT_KEYBINDING_RULES,
  isKeybindingId,
  type KeybindingId,
} from "@/lib/keybindings-catalog"
import { getHotkeysPlatform, type HotkeysPlatform } from "@/lib/keyboard-shortcut"

export const MAX_KEYBINDINGS_COUNT = 256
export const MAX_KEYBINDING_VALUE_LENGTH = 64

export interface KeybindingRule {
  readonly key: string
  readonly command: KeybindingId
  readonly when?: string
}

export interface KeybindingShortcut {
  readonly key: string
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly shiftKey: boolean
  readonly altKey: boolean
  readonly modKey: boolean
}

export interface ResolvedKeybindingRule {
  readonly command: KeybindingId
  readonly shortcut: KeybindingShortcut
  readonly whenAst?: KeybindingWhenNode
}

export type ResolvedKeybindingsConfig = ReadonlyArray<ResolvedKeybindingRule>

export interface ResolvedKeybindings {
  readonly "palette.open": string
  readonly "settings.open": string
  readonly "thread.create": string
  readonly "thread.rename": string
  readonly "thread.pin": string
  readonly "thread.settle": string
  readonly "thread.model-picker.open": string
  readonly "board.search": string
  readonly "board.ticket.create": string
  readonly "board.ticket.open": string
  readonly "board.ticket.rename": string
  readonly "board.column.rename": string
  readonly "board.navigate.up": string
  readonly "board.navigate.down": string
  readonly "board.navigate.left": string
  readonly "board.navigate.right": string
  readonly "board.move.up": string
  readonly "board.move.down": string
  readonly "board.move.left": string
  readonly "board.move.right": string
  readonly "settings.search": string
}

export interface ShortcutEventLike {
  readonly type?: string
  readonly code?: string
  readonly key: string
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly shiftKey: boolean
  readonly altKey: boolean
}

const EVENT_CODE_KEY_ALIASES = new Map<string, ReadonlyArray<string>>([
  ["BracketLeft", ["["]],
  ["BracketRight", ["]"]],
  ["Digit0", ["0"]],
  ["Digit1", ["1"]],
  ["Digit2", ["2"]],
  ["Digit3", ["3"]],
  ["Digit4", ["4"]],
  ["Digit5", ["5"]],
  ["Digit6", ["6"]],
  ["Digit7", ["7"]],
  ["Digit8", ["8"]],
  ["Digit9", ["9"]],
])

const emptyContext = (): KeybindingContext => ({
  tableau: false,
  thread: false,
  settings: false,
  ticketSelected: false,
  columnSelected: false,
  dialogOpen: false,
  editableFocused: false,
})

const normalizeKeyToken = (token: string): string => {
  if (token === "space") {
    return " "
  }
  if (token === "esc") {
    return "escape"
  }
  return token
}

export const parseKeybindingShortcut = (value: string): KeybindingShortcut | null => {
  const rawTokens = value
    .toLowerCase()
    .split("+")
    .map((token) => token.trim())
  const tokens = [...rawTokens]
  let trailingEmptyCount = 0
  while (tokens[tokens.length - 1] === "") {
    trailingEmptyCount += 1
    tokens.pop()
  }
  if (trailingEmptyCount > 0) {
    tokens.push("+")
  }
  if (tokens.some((token) => token.length === 0) || tokens.length === 0) {
    return null
  }

  let key: string | null = null
  let metaKey = false
  let ctrlKey = false
  let shiftKey = false
  let altKey = false
  let modKey = false

  for (const token of tokens) {
    switch (token) {
      case "cmd":
      case "meta":
        metaKey = true
        break
      case "ctrl":
      case "control":
        ctrlKey = true
        break
      case "shift":
        shiftKey = true
        break
      case "alt":
      case "option":
        altKey = true
        break
      case "mod":
        modKey = true
        break
      default: {
        if (key !== null) {
          return null
        }
        key = normalizeKeyToken(token)
      }
    }
  }

  if (key === null) {
    return null
  }
  return { key, metaKey, ctrlKey, shiftKey, altKey, modKey }
}

export const shortcutToKeybindingInput = (shortcut: KeybindingShortcut): string => {
  const parts: string[] = []
  if (shortcut.modKey) {
    parts.push("mod")
  }
  if (shortcut.metaKey) {
    parts.push("meta")
  }
  if (shortcut.ctrlKey) {
    parts.push("ctrl")
  }
  if (shortcut.altKey) {
    parts.push("alt")
  }
  if (shortcut.shiftKey) {
    parts.push("shift")
  }
  parts.push(shortcut.key === " " ? "space" : shortcut.key === "escape" ? "esc" : shortcut.key)
  return parts.join("+")
}

const tanstackKeyLabel = (key: string): string => {
  if (key === " ") {
    return "Space"
  }
  if (key === "escape") {
    return "Escape"
  }
  if (key === "arrowup") {
    return "ArrowUp"
  }
  if (key === "arrowdown") {
    return "ArrowDown"
  }
  if (key === "arrowleft") {
    return "ArrowLeft"
  }
  if (key === "arrowright") {
    return "ArrowRight"
  }
  if (key === "pageup") {
    return "PageUp"
  }
  if (key === "pagedown") {
    return "PageDown"
  }
  if (key.length === 1) {
    return key.toUpperCase()
  }
  return key.slice(0, 1).toUpperCase() + key.slice(1)
}

export const shortcutToTanstackHotkey = (shortcut: KeybindingShortcut): string => {
  const parts: string[] = []
  if (shortcut.modKey) {
    parts.push("Mod")
  }
  if (shortcut.metaKey) {
    parts.push("Meta")
  }
  if (shortcut.ctrlKey) {
    parts.push("Ctrl")
  }
  if (shortcut.shiftKey) {
    parts.push("Shift")
  }
  if (shortcut.altKey) {
    parts.push("Alt")
  }
  parts.push(tanstackKeyLabel(shortcut.key))
  return parts.join("+")
}

export const compileResolvedKeybindingRule = (
  rule: KeybindingRule,
): ResolvedKeybindingRule | null => {
  if (rule.key.length === 0 || rule.key.length > MAX_KEYBINDING_VALUE_LENGTH) {
    return null
  }
  const shortcut = parseKeybindingShortcut(rule.key)
  if (shortcut === null) {
    return null
  }
  if (rule.when === undefined) {
    return { command: rule.command, shortcut }
  }
  const whenAst = parseKeybindingWhenExpression(rule.when)
  if (whenAst === null) {
    return null
  }
  return { command: rule.command, shortcut, whenAst }
}

export const compileResolvedKeybindingsConfig = (
  config: ReadonlyArray<KeybindingRule>,
): ResolvedKeybindingsConfig => {
  const compiled: ResolvedKeybindingRule[] = []
  for (const rule of config) {
    const result = compileResolvedKeybindingRule(rule)
    if (result !== null) {
      compiled.push(result)
    }
  }
  return compiled.slice(-MAX_KEYBINDINGS_COUNT)
}

export const DEFAULT_RESOLVED_KEYBINDINGS =
  compileResolvedKeybindingsConfig(DEFAULT_KEYBINDING_RULES)

export const mergeWithDefaultKeybindings = (
  custom: ResolvedKeybindingsConfig,
): ResolvedKeybindingsConfig => {
  if (custom.length === 0) {
    return [...DEFAULT_RESOLVED_KEYBINDINGS]
  }
  const overriddenCommands = new Set(custom.map((binding) => binding.command))
  const retainedDefaults = DEFAULT_RESOLVED_KEYBINDINGS.filter(
    (binding) => !overriddenCommands.has(binding.command),
  )
  const merged = [...retainedDefaults, ...custom]
  if (merged.length <= MAX_KEYBINDINGS_COUNT) {
    return merged
  }
  return merged.slice(-MAX_KEYBINDINGS_COUNT)
}

export const compileAndMergeKeybindings = (
  rules: ReadonlyArray<KeybindingRule>,
): ResolvedKeybindingsConfig => mergeWithDefaultKeybindings(compileResolvedKeybindingsConfig(rules))

const normalizeEventKey = (key: string): string => {
  const normalized = key.toLowerCase()
  if (normalized === "esc") {
    return "escape"
  }
  return normalized
}

const resolveEventKeys = (event: ShortcutEventLike): Set<string> => {
  const layoutKey = normalizeEventKey(event.key)
  const keys = new Set([layoutKey])
  const letterCode = event.code?.match(/^Key([A-Z])$/)?.[1]
  if (letterCode !== undefined && !/^[a-z]$/.test(layoutKey)) {
    keys.add(letterCode.toLowerCase())
  }
  const aliases = event.code === undefined ? undefined : EVENT_CODE_KEY_ALIASES.get(event.code)
  if (aliases === undefined) {
    return keys
  }
  for (const alias of aliases) {
    keys.add(alias)
  }
  return keys
}

const matchesShortcutModifiers = (
  event: Pick<ShortcutEventLike, "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
  shortcut: KeybindingShortcut,
  platform: HotkeysPlatform,
): boolean => {
  const useMetaForMod = platform === "mac"
  const expectedMeta = shortcut.metaKey || (shortcut.modKey && useMetaForMod)
  const expectedCtrl = shortcut.ctrlKey || (shortcut.modKey && !useMetaForMod)
  return (
    event.metaKey === expectedMeta &&
    event.ctrlKey === expectedCtrl &&
    event.shiftKey === shortcut.shiftKey &&
    event.altKey === shortcut.altKey
  )
}

const matchesShortcut = (
  event: ShortcutEventLike,
  shortcut: KeybindingShortcut,
  platform: HotkeysPlatform,
): boolean => {
  if (!matchesShortcutModifiers(event, shortcut, platform)) {
    return false
  }
  return resolveEventKeys(event).has(shortcut.key)
}

const shortcutConflictKey = (shortcut: KeybindingShortcut, platform: HotkeysPlatform): string => {
  const useMetaForMod = platform === "mac"
  const metaKey = shortcut.metaKey || (shortcut.modKey && useMetaForMod)
  const ctrlKey = shortcut.ctrlKey || (shortcut.modKey && !useMetaForMod)
  return [
    shortcut.key,
    metaKey ? "meta" : "",
    ctrlKey ? "ctrl" : "",
    shortcut.shiftKey ? "shift" : "",
    shortcut.altKey ? "alt" : "",
  ].join("|")
}

export const findEffectiveShortcutForCommand = (
  keybindings: ResolvedKeybindingsConfig,
  command: KeybindingId,
  context: KeybindingContext = emptyContext(),
  platform: HotkeysPlatform = getHotkeysPlatform(),
): KeybindingShortcut | null => {
  const claimedShortcuts = new Set<string>()
  for (let index = keybindings.length - 1; index >= 0; index -= 1) {
    const binding = keybindings[index]
    if (binding === undefined || !matchesWhenClause(binding.whenAst, context)) {
      continue
    }
    const conflictKey = shortcutConflictKey(binding.shortcut, platform)
    if (claimedShortcuts.has(conflictKey)) {
      continue
    }
    claimedShortcuts.add(conflictKey)
    if (binding.command === command) {
      return binding.shortcut
    }
  }
  return null
}

const lastShortcutForCommand = (
  keybindings: ResolvedKeybindingsConfig,
  command: KeybindingId,
): KeybindingShortcut | null => {
  for (let index = keybindings.length - 1; index >= 0; index -= 1) {
    const binding = keybindings[index]
    if (binding?.command === command) {
      return binding.shortcut
    }
  }
  return null
}

export const resolveShortcutCommand = (
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  context: KeybindingContext,
  platform: HotkeysPlatform = getHotkeysPlatform(),
): KeybindingId | undefined => {
  for (let index = keybindings.length - 1; index >= 0; index -= 1) {
    const binding = keybindings[index]
    if (binding === undefined) {
      continue
    }
    if (!matchesWhenClause(binding.whenAst, context)) {
      continue
    }
    if (!matchesShortcut(event, binding.shortcut, platform)) {
      continue
    }
    return binding.command
  }
  return undefined
}

export const resolveMatchingKeybinding = (
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  context: KeybindingContext,
  platform: HotkeysPlatform = getHotkeysPlatform(),
): KeybindingId | undefined => resolveShortcutCommand(event, keybindings, context, platform)

const tanstackLabelForCommand = (
  keybindings: ResolvedKeybindingsConfig,
  command: KeybindingId,
  context: KeybindingContext,
  platform: HotkeysPlatform,
): string => {
  const shortcut =
    findEffectiveShortcutForCommand(keybindings, command, context, platform) ??
    lastShortcutForCommand(keybindings, command)
  return shortcut === null ? "" : shortcutToTanstackHotkey(shortcut)
}

export const resolveKeybindings = (
  rules: ReadonlyArray<KeybindingRule> = [],
  context: KeybindingContext = emptyContext(),
  platform: HotkeysPlatform = getHotkeysPlatform(),
): ResolvedKeybindings => {
  const merged = compileAndMergeKeybindings(rules)
  return {
    "palette.open": tanstackLabelForCommand(merged, "palette.open", context, platform),
    "settings.open": tanstackLabelForCommand(merged, "settings.open", context, platform),
    "thread.create": tanstackLabelForCommand(merged, "thread.create", context, platform),
    "thread.rename": tanstackLabelForCommand(merged, "thread.rename", context, platform),
    "thread.pin": tanstackLabelForCommand(merged, "thread.pin", context, platform),
    "thread.settle": tanstackLabelForCommand(merged, "thread.settle", context, platform),
    "thread.model-picker.open": tanstackLabelForCommand(
      merged,
      "thread.model-picker.open",
      context,
      platform,
    ),
    "board.search": tanstackLabelForCommand(merged, "board.search", context, platform),
    "board.ticket.create": tanstackLabelForCommand(
      merged,
      "board.ticket.create",
      context,
      platform,
    ),
    "board.ticket.open": tanstackLabelForCommand(merged, "board.ticket.open", context, platform),
    "board.ticket.rename": tanstackLabelForCommand(
      merged,
      "board.ticket.rename",
      context,
      platform,
    ),
    "board.column.rename": tanstackLabelForCommand(
      merged,
      "board.column.rename",
      context,
      platform,
    ),
    "board.navigate.up": tanstackLabelForCommand(merged, "board.navigate.up", context, platform),
    "board.navigate.down": tanstackLabelForCommand(
      merged,
      "board.navigate.down",
      context,
      platform,
    ),
    "board.navigate.left": tanstackLabelForCommand(
      merged,
      "board.navigate.left",
      context,
      platform,
    ),
    "board.navigate.right": tanstackLabelForCommand(
      merged,
      "board.navigate.right",
      context,
      platform,
    ),
    "board.move.up": tanstackLabelForCommand(merged, "board.move.up", context, platform),
    "board.move.down": tanstackLabelForCommand(merged, "board.move.down", context, platform),
    "board.move.left": tanstackLabelForCommand(merged, "board.move.left", context, platform),
    "board.move.right": tanstackLabelForCommand(merged, "board.move.right", context, platform),
    "settings.search": tanstackLabelForCommand(merged, "settings.search", context, platform),
  }
}

export const resolveKeybinding = (
  id: KeybindingId,
  rules: ReadonlyArray<KeybindingRule> = [],
  context: KeybindingContext = emptyContext(),
  platform: HotkeysPlatform = getHotkeysPlatform(),
): string => resolveKeybindings(rules, context, platform)[id]

export const isSameKeybindingRule = (left: KeybindingRule, right: KeybindingRule): boolean =>
  left.command === right.command &&
  left.key === right.key &&
  (left.when ?? undefined) === (right.when ?? undefined)

export const upsertKeybindingRule = (
  rules: ReadonlyArray<KeybindingRule>,
  next: KeybindingRule,
  replace?: KeybindingRule,
): ReadonlyArray<KeybindingRule> => {
  const filtered = rules.filter((entry) => {
    if (replace !== undefined) {
      return !isSameKeybindingRule(entry, replace) && !isSameKeybindingRule(entry, next)
    }
    return !isSameKeybindingRule(entry, next)
  })
  const nextConfig = [...filtered, next]
  return nextConfig.length > MAX_KEYBINDINGS_COUNT
    ? nextConfig.slice(-MAX_KEYBINDINGS_COUNT)
    : nextConfig
}

export const removeKeybindingRule = (
  rules: ReadonlyArray<KeybindingRule>,
  target: KeybindingRule,
): ReadonlyArray<KeybindingRule> => rules.filter((entry) => !isSameKeybindingRule(entry, target))

export const keybindingConflicts = (
  command: KeybindingId,
  key: string,
  keybindings: ResolvedKeybindingsConfig,
  when = "",
): ReadonlyArray<KeybindingId> => {
  const commands = new Set<KeybindingId>()
  for (const candidate of keybindings) {
    if (candidate.command === command) {
      continue
    }
    if (shortcutToKeybindingInput(candidate.shortcut) !== key) {
      continue
    }
    const candidateWhen = whenAstToExpression(candidate.whenAst)
    if (when.length === 0 || candidateWhen.length === 0 || when === candidateWhen) {
      commands.add(candidate.command)
    }
  }
  return [...commands]
}

export const isKeybindingRuleCommand = (value: string): value is KeybindingId =>
  isKeybindingId(value)
