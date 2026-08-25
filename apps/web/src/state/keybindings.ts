import type { Hotkey } from "@tanstack/react-hotkeys"
import { Atom } from "effect/unstable/reactivity"

import {
  canonicalizeHotkey,
  emptyKeybindingOverrides,
  hasCustomKeybindings as hasCustomKeybindingsIn,
  isCustomKeybinding as isCustomKeybindingIn,
  matchesKeybinding as matchesResolvedKeybinding,
  persistKeybindingOverrides,
  readStoredKeybindingOverrides,
  resolveKeybindings,
  type KeybindingOverrides,
  type ResolvedKeybindings,
} from "@/lib/keybindings"
import { defaultKeybinding, type KeybindingId } from "@/lib/keybindings-catalog"
import { getHotkeysPlatform } from "@/lib/keyboard-shortcut"
import { appAtomRegistry } from "@/state/atom-registry"
import { persistWritableAtom } from "@/state/persist"

export const keybindingOverridesAtom = Atom.make<KeybindingOverrides>(
  emptyKeybindingOverrides(),
).pipe(Atom.keepAlive, Atom.withLabel("pref:keybinding-overrides"))

export const resolvedKeybindingsAtom = Atom.make((get): ResolvedKeybindings =>
  resolveKeybindings(get(keybindingOverridesAtom)),
).pipe(Atom.withLabel("pref:keybindings-resolved"))

export const keybindingRecorderActiveAtom = Atom.make(false).pipe(
  Atom.keepAlive,
  Atom.withLabel("chrome:keybinding-recorder"),
)

let initialized = false

export const initializeKeybindings = (): void => {
  if (initialized) {
    return
  }
  initialized = true
  persistWritableAtom(keybindingOverridesAtom, {
    read: readStoredKeybindingOverrides,
    write: persistKeybindingOverrides,
  })
}

export const getKeybindingOverrides = (): KeybindingOverrides =>
  appAtomRegistry.get(keybindingOverridesAtom)

export const getResolvedKeybindings = (): ResolvedKeybindings =>
  appAtomRegistry.get(resolvedKeybindingsAtom)

export const hasCustomKeybindings = (): boolean =>
  hasCustomKeybindingsIn(appAtomRegistry.get(keybindingOverridesAtom))

export const isCustomKeybinding = (id: KeybindingId): boolean =>
  isCustomKeybindingIn(id, appAtomRegistry.get(keybindingOverridesAtom))

export const matchesKeybinding = (event: KeyboardEvent, id: KeybindingId): boolean =>
  matchesResolvedKeybinding(event, id, appAtomRegistry.get(resolvedKeybindingsAtom))

export const isKeybindingRecorderActive = (): boolean =>
  appAtomRegistry.get(keybindingRecorderActiveAtom)

export const setKeybindingRecorderActive = (active: boolean): void => {
  if (active === appAtomRegistry.get(keybindingRecorderActiveAtom)) {
    return
  }
  appAtomRegistry.set(keybindingRecorderActiveAtom, active)
}

export const setKeybinding = (id: KeybindingId, hotkey: string): void => {
  const canonical = canonicalizeHotkey(hotkey, getHotkeysPlatform())
  if (canonical === undefined) {
    return
  }
  const current = appAtomRegistry.get(keybindingOverridesAtom)
  const next = new Map(current)
  if (canonical === defaultKeybinding(id)) {
    next.delete(id)
  } else {
    next.set(id, canonical)
  }
  appAtomRegistry.set(keybindingOverridesAtom, next)
}

export const resetKeybinding = (id: KeybindingId): void => {
  const current = appAtomRegistry.get(keybindingOverridesAtom)
  if (!current.has(id)) {
    return
  }
  const next = new Map(current)
  next.delete(id)
  appAtomRegistry.set(keybindingOverridesAtom, next)
}

export const resetAllKeybindings = (): void => {
  if (!hasCustomKeybindings()) {
    return
  }
  appAtomRegistry.set(keybindingOverridesAtom, emptyKeybindingOverrides())
}

export type { Hotkey, KeybindingOverrides, ResolvedKeybindings }
