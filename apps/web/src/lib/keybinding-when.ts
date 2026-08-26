export const KEYBINDING_SURFACES = ["tableau", "thread", "settings"] as const

export type KeybindingSurface = (typeof KEYBINDING_SURFACES)[number]

export const KEYBINDING_CONDITION_KEYS = [
  "surface",
  "ticketSelected",
  "columnSelected",
  "dialogOpen",
  "editableFocused",
] as const

export type KeybindingConditionKey = (typeof KEYBINDING_CONDITION_KEYS)[number]

export interface KeybindingCondition {
  readonly surface?: KeybindingSurface
  readonly ticketSelected?: boolean
  readonly columnSelected?: boolean
  readonly dialogOpen?: boolean
  readonly editableFocused?: boolean
}

export interface KeybindingConditionSnapshot {
  readonly surface: KeybindingSurface | undefined
  readonly ticketSelected: boolean
  readonly columnSelected: boolean
  readonly dialogOpen: boolean
  readonly editableFocused: boolean
}

const SURFACE_LABELS = {
  tableau: "sur le Tableau",
  thread: "dans un Thread",
  settings: "dans les Paramètres",
} as const satisfies Record<KeybindingSurface, string>

export const resolveKeybindingSurface = (pathname: string): KeybindingSurface | undefined => {
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return "settings"
  }
  if (/^\/projects\/[^/]+\/board\/?$/.test(pathname)) {
    return "tableau"
  }
  if (/^\/projects\/[^/]+\/thread\/[^/]+\/?$/.test(pathname)) {
    return "thread"
  }
  if (pathname === "/") {
    return "tableau"
  }
  return undefined
}

export const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) {
    return false
  }
  return target.closest("input, textarea, select, [contenteditable=true]") !== null
}

export const isDialogOpen = (): boolean =>
  document.querySelector('[role="dialog"], [aria-modal="true"]') !== null

export const matchKeybindingCondition = (
  when: KeybindingCondition,
  snapshot: KeybindingConditionSnapshot,
): boolean => {
  if (when.surface !== undefined && when.surface !== snapshot.surface) {
    return false
  }
  if (when.ticketSelected !== undefined && when.ticketSelected !== snapshot.ticketSelected) {
    return false
  }
  if (when.columnSelected !== undefined && when.columnSelected !== snapshot.columnSelected) {
    return false
  }
  if (when.dialogOpen !== undefined && when.dialogOpen !== snapshot.dialogOpen) {
    return false
  }
  if (when.editableFocused !== undefined && when.editableFocused !== snapshot.editableFocused) {
    return false
  }
  return true
}

export const keybindingConditionsOverlap = (
  left: KeybindingCondition,
  right: KeybindingCondition,
): boolean => {
  for (const key of KEYBINDING_CONDITION_KEYS) {
    const leftValue = left[key]
    const rightValue = right[key]
    if (leftValue !== undefined && rightValue !== undefined && leftValue !== rightValue) {
      return false
    }
  }
  return true
}

export const keybindingConditionSpecificity = (when: KeybindingCondition): number =>
  KEYBINDING_CONDITION_KEYS.filter((key) => when[key] !== undefined).length

export const describeKeybindingCondition = (when: KeybindingCondition): string | undefined => {
  const parts: string[] = []
  if (when.surface !== undefined) {
    parts.push(SURFACE_LABELS[when.surface])
  }
  if (when.ticketSelected === true) {
    parts.push("ticket sélectionné")
  }
  if (when.columnSelected === true) {
    parts.push("colonne ciblée")
  }
  return parts.length === 0 ? undefined : parts.join(" · ")
}
