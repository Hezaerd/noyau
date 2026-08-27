import {
  collectWhenIdentifiers,
  isKnownWhenVariable,
  KEYBINDING_WHEN_IDENTIFIERS,
  parseWhenExpressionDraft,
  whenAstToExpression,
  whenExpressionsConflict,
  type KeybindingWhenNode,
} from "@/lib/keybinding-when"
import {
  DEFAULT_RESOLVED_KEYBINDINGS,
  shortcutToKeybindingInput,
  type KeybindingRule,
  type ResolvedKeybindingRule,
  type ResolvedKeybindingsConfig,
} from "@/lib/keybindings"
import {
  commandLabel,
  DEFAULT_KEYBINDING_RULES,
  KEYBINDING_IDS,
  type KeybindingId,
} from "@/lib/keybindings-catalog"
import { getHotkeysPlatform, type HotkeysPlatform } from "@/lib/keyboard-shortcut"

export type KeybindingSource = "Default" | "Custom"

export interface KeybindingRow {
  readonly id: string
  readonly command: KeybindingId
  readonly key: string
  readonly when: string
  readonly source: KeybindingSource
  readonly defaultKey: string | null
  readonly defaultWhen: string
  readonly binding: ResolvedKeybindingRule
}

export type WhenVariableOption = string

const DEFAULT_WHEN_VARIABLES = new Set<string>(KEYBINDING_WHEN_IDENTIFIERS)
for (const binding of DEFAULT_RESOLVED_KEYBINDINGS) {
  collectWhenIdentifiers(binding.whenAst, DEFAULT_WHEN_VARIABLES)
}

export const DEFAULT_WHEN_VARIABLE =
  [...DEFAULT_WHEN_VARIABLES].find(
    (identifier) => identifier !== "true" && identifier !== "false",
  ) ?? "tableau"

const sourceForBinding = (binding: ResolvedKeybindingRule): KeybindingSource => {
  const bindingKey = shortcutToKeybindingInput(binding.shortcut)
  const bindingWhen = whenAstToExpression(binding.whenAst)
  const isDefault = DEFAULT_RESOLVED_KEYBINDINGS.some(
    (entry) =>
      entry.command === binding.command &&
      shortcutToKeybindingInput(entry.shortcut) === bindingKey &&
      whenAstToExpression(entry.whenAst) === bindingWhen,
  )
  return isDefault ? "Default" : "Custom"
}

const defaultBindingForBinding = (
  binding: ResolvedKeybindingRule,
): ResolvedKeybindingRule | undefined => {
  const bindingKey = shortcutToKeybindingInput(binding.shortcut)
  const bindingWhen = whenAstToExpression(binding.whenAst)
  return (
    DEFAULT_RESOLVED_KEYBINDINGS.find(
      (entry) =>
        entry.command === binding.command &&
        shortcutToKeybindingInput(entry.shortcut) === bindingKey &&
        whenAstToExpression(entry.whenAst) === bindingWhen,
    ) ??
    DEFAULT_RESOLVED_KEYBINDINGS.find(
      (entry) =>
        entry.command === binding.command && whenAstToExpression(entry.whenAst) === bindingWhen,
    ) ??
    DEFAULT_RESOLVED_KEYBINDINGS.find((entry) => entry.command === binding.command)
  )
}

const keybindingRowId = (command: KeybindingId, key: string, when: string, index: number): string =>
  `${command}\u0000${key}\u0000${when}\u0000${String(index)}`

export const keybindingConflictLabels = (
  rows: ReadonlyArray<KeybindingRow>,
  input: { readonly rowId: string; readonly key: string; readonly when: string },
): ReadonlyArray<string> => {
  if (input.key.trim().length === 0) {
    return []
  }
  const conflicts: string[] = []
  for (const candidate of rows) {
    if (
      candidate.id !== input.rowId &&
      candidate.key === input.key &&
      whenExpressionsConflict(candidate.when, input.when)
    ) {
      conflicts.push(commandLabel(candidate.command))
    }
  }
  return [...new Set(conflicts)].toSorted()
}

export const buildKeybindingRows = (
  keybindings: ResolvedKeybindingsConfig,
  query: string,
): ReadonlyArray<KeybindingRow> => {
  const normalizedQuery = query.trim().toLowerCase()
  const rows = keybindings.map((binding, index) => {
    const defaultBinding = defaultBindingForBinding(binding)
    const key = shortcutToKeybindingInput(binding.shortcut)
    const when = whenAstToExpression(binding.whenAst)
    return {
      id: keybindingRowId(binding.command, key, when, index),
      command: binding.command,
      key,
      when,
      source: sourceForBinding(binding),
      defaultKey:
        defaultBinding === undefined ? null : shortcutToKeybindingInput(defaultBinding.shortcut),
      defaultWhen: whenAstToExpression(defaultBinding?.whenAst),
      binding,
    } satisfies KeybindingRow
  })

  rows.sort((left, right) => {
    const commandCompare = commandLabel(left.command).localeCompare(commandLabel(right.command))
    if (commandCompare !== 0) {
      return commandCompare
    }
    return left.key.localeCompare(right.key)
  })

  if (normalizedQuery.length === 0) {
    return rows
  }

  return rows.filter((row) => {
    return (
      row.command.toLowerCase().includes(normalizedQuery) ||
      commandLabel(row.command).toLowerCase().includes(normalizedQuery) ||
      row.key.toLowerCase().includes(normalizedQuery) ||
      row.when.toLowerCase().includes(normalizedQuery) ||
      row.source.toLowerCase().includes(normalizedQuery)
    )
  })
}

export const buildWhenVariableOptions = (): ReadonlyArray<WhenVariableOption> =>
  [...DEFAULT_WHEN_VARIABLES].toSorted((left, right) => {
    const leftCoreIndex = KEYBINDING_WHEN_IDENTIFIERS.findIndex((identifier) => identifier === left)
    const rightCoreIndex = KEYBINDING_WHEN_IDENTIFIERS.findIndex(
      (identifier) => identifier === right,
    )
    if (leftCoreIndex !== -1 || rightCoreIndex !== -1) {
      return (
        (leftCoreIndex === -1 ? Number.MAX_SAFE_INTEGER : leftCoreIndex) -
        (rightCoreIndex === -1 ? Number.MAX_SAFE_INTEGER : rightCoreIndex)
      )
    }
    return left.localeCompare(right)
  })

export const buildKeybindingCommandOptions = (): ReadonlyArray<KeybindingId> =>
  [...KEYBINDING_IDS].toSorted((left, right) =>
    commandLabel(left).localeCompare(commandLabel(right)),
  )

export const unknownWhenVariables = (
  node: KeybindingWhenNode | undefined,
): ReadonlyArray<string> => {
  const identifiers = collectWhenIdentifiers(node)
  return [...identifiers].filter((identifier) => !isKnownWhenVariable(identifier)).toSorted()
}

export const normalizeShortcutKeyToken = (key: string): string | null => {
  const normalized = key.toLowerCase()
  if (
    normalized === "meta" ||
    normalized === "control" ||
    normalized === "ctrl" ||
    normalized === "shift" ||
    normalized === "alt" ||
    normalized === "option"
  ) {
    return null
  }
  if (normalized === " ") {
    return "space"
  }
  if (normalized === "escape") {
    return "esc"
  }
  if (
    normalized === "arrowup" ||
    normalized === "arrowdown" ||
    normalized === "arrowleft" ||
    normalized === "arrowright"
  ) {
    return normalized
  }
  if (normalized.length === 1) {
    return normalized
  }
  if (/^f\d{1,2}$/.test(normalized)) {
    return normalized
  }
  if (
    normalized === "enter" ||
    normalized === "tab" ||
    normalized === "backspace" ||
    normalized === "delete" ||
    normalized === "home" ||
    normalized === "end" ||
    normalized === "pageup" ||
    normalized === "pagedown"
  ) {
    return normalized
  }
  return null
}

export const keybindingFromKeyboardEvent = (
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  platform: string,
): string | null => {
  const keyToken = normalizeShortcutKeyToken(event.key)
  if (keyToken === null) {
    return null
  }
  const hotkeysPlatform: HotkeysPlatform =
    platform.toLowerCase().includes("mac") || platform.toLowerCase() === "darwin"
      ? "mac"
      : getHotkeysPlatform(platform)
  const parts: string[] = []
  if (hotkeysPlatform === "mac") {
    if (event.metaKey) {
      parts.push("mod")
    }
    if (event.ctrlKey) {
      parts.push("ctrl")
    }
  } else {
    if (event.ctrlKey) {
      parts.push("mod")
    }
    if (event.metaKey) {
      parts.push("meta")
    }
  }
  if (event.altKey) {
    parts.push("alt")
  }
  if (event.shiftKey) {
    parts.push("shift")
  }
  parts.push(keyToken)
  return parts.join("+")
}

export const persistedRulesOrDefaults = (
  rules: ReadonlyArray<KeybindingRule>,
): ReadonlyArray<KeybindingRule> => (rules.length === 0 ? DEFAULT_KEYBINDING_RULES : rules)

export { commandLabel, isKnownWhenVariable, parseWhenExpressionDraft, whenAstToExpression }
