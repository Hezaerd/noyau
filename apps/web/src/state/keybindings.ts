import { Atom } from "effect/unstable/reactivity"

import {
  compileAndMergeKeybindings,
  keybindingTombstone,
  removeKeybindingRule,
  resolveKeybindings,
  upsertKeybindingRule,
  type KeybindingRule,
  type ResolvedKeybindings,
  type ResolvedKeybindingsConfig,
} from "@/lib/keybindings"
import { type KeybindingId } from "@/lib/keybindings-catalog"
import { persistedRulesOrDefaults } from "@/lib/keybindings-settings"
import {
  hasKeybindingsEdits,
  persistKeybindingsRules,
  readStoredKeybindingsRules,
} from "@/lib/keybinds-file"
import { appAtomRegistry } from "@/state/atom-registry"
import { persistWritableAtom } from "@/state/persist"

export const keybindingsRulesAtom = Atom.make<ReadonlyArray<KeybindingRule>>([]).pipe(
  Atom.keepAlive,
  Atom.withLabel("pref:keybindings-rules"),
)

export const resolvedKeybindingsConfigAtom = Atom.make((get): ResolvedKeybindingsConfig =>
  compileAndMergeKeybindings(get(keybindingsRulesAtom)),
).pipe(Atom.withLabel("pref:keybindings-resolved-config"))

export const resolvedKeybindingsAtom = Atom.make((get): ResolvedKeybindings =>
  resolveKeybindings(get(keybindingsRulesAtom)),
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
  persistWritableAtom(keybindingsRulesAtom, {
    read: readStoredKeybindingsRules,
    write: persistKeybindingsRules,
  })
}

export const getKeybindingsRules = (): ReadonlyArray<KeybindingRule> =>
  appAtomRegistry.get(keybindingsRulesAtom)

export const getResolvedKeybindingsConfig = (): ResolvedKeybindingsConfig =>
  appAtomRegistry.get(resolvedKeybindingsConfigAtom)

export const getResolvedKeybindings = (): ResolvedKeybindings =>
  appAtomRegistry.get(resolvedKeybindingsAtom)

export const hasCustomKeybindings = (): boolean =>
  hasKeybindingsEdits(appAtomRegistry.get(keybindingsRulesAtom))

export const isKeybindingRecorderActive = (): boolean =>
  appAtomRegistry.get(keybindingRecorderActiveAtom)

export const setKeybindingRecorderActive = (active: boolean): void => {
  if (active === appAtomRegistry.get(keybindingRecorderActiveAtom)) {
    return
  }
  appAtomRegistry.set(keybindingRecorderActiveAtom, active)
}

const writeRules = (rules: ReadonlyArray<KeybindingRule>): void => {
  appAtomRegistry.set(keybindingsRulesAtom, rules)
}

export const upsertKeybinding = (input: {
  readonly command: KeybindingId
  readonly key: string
  readonly when?: string
  readonly replace?: KeybindingRule
}): void => {
  const current = persistedRulesOrDefaults(appAtomRegistry.get(keybindingsRulesAtom))
  const next: KeybindingRule =
    input.when === undefined || input.when.length === 0
      ? { key: input.key, command: input.command }
      : { key: input.key, command: input.command, when: input.when }
  writeRules(upsertKeybindingRule(current, next, input.replace))
}

export const removeKeybinding = (target: KeybindingRule): void => {
  const current = persistedRulesOrDefaults(appAtomRegistry.get(keybindingsRulesAtom))
  const without = removeKeybindingRule(current, target)
  if (without.some((entry) => entry.command === target.command)) {
    writeRules(without)
    return
  }
  writeRules([...without, keybindingTombstone(target.command)])
}

export const resetKeybinding = (row: {
  readonly command: KeybindingId
  readonly key: string
  readonly when: string
  readonly defaultKey: string | null
  readonly defaultWhen: string
}): void => {
  if (row.defaultKey === null) {
    return
  }
  const replace: KeybindingRule =
    row.when.length > 0
      ? { command: row.command, key: row.key, when: row.when }
      : { command: row.command, key: row.key }
  if (row.defaultWhen.length > 0) {
    upsertKeybinding({
      command: row.command,
      key: row.defaultKey,
      when: row.defaultWhen,
      replace,
    })
    return
  }
  upsertKeybinding({
    command: row.command,
    key: row.defaultKey,
    replace,
  })
}

export const resetAllKeybindings = (): void => {
  if (!hasCustomKeybindings()) {
    return
  }
  writeRules([])
}

export const replaceKeybindingsRules = (rules: ReadonlyArray<KeybindingRule>): void => {
  writeRules(rules)
}

export type { KeybindingRule, ResolvedKeybindings, ResolvedKeybindingsConfig }
