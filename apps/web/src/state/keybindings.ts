import {
  sameKeybindingsRules,
  serializeKeybindingsFile,
  type KeybindingRule as FileKeybindingRule,
} from "@noyau/contracts/keybindings"
import { Atom } from "effect/unstable/reactivity"

import { getKeybindings, replaceKeybindings } from "@/lib/control-plane"
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
  clearStoredKeybindingsRules,
  hasKeybindingsEdits,
  parseKeybindingsRules,
  readStoredKeybindingsRules,
} from "@/lib/keybinds-file"
import { appAtomRegistry } from "@/state/atom-registry"

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

const toClientRules = (rules: ReadonlyArray<FileKeybindingRule>): ReadonlyArray<KeybindingRule> =>
  parseKeybindingsRules(serializeKeybindingsFile(rules))

export const applyKeybindingsRules = (rules: ReadonlyArray<FileKeybindingRule>): void => {
  const next = toClientRules(rules)
  const current = appAtomRegistry.get(keybindingsRulesAtom)
  if (sameKeybindingsRules(current, next)) {
    return
  }
  appAtomRegistry.set(keybindingsRulesAtom, next)
}

const persistRulesToServer = (rules: ReadonlyArray<KeybindingRule>): void => {
  applyKeybindingsRules(rules)
  void replaceKeybindings({ rules }).then((result) => {
    if (result.ok) {
      applyKeybindingsRules(result.value.rules)
    }
    return undefined
  })
}

export const hydrateKeybindingsFromServer = (): void => {
  const startedWith = appAtomRegistry.get(keybindingsRulesAtom)
  void getKeybindings().then((result) => {
    if (!result.ok) {
      return undefined
    }
    const current = appAtomRegistry.get(keybindingsRulesAtom)
    if (!sameKeybindingsRules(current, startedWith)) {
      clearStoredKeybindingsRules()
      return undefined
    }
    const local = readStoredKeybindingsRules()
    if (result.value.rules.length === 0 && local.length > 0) {
      persistRulesToServer(local)
      clearStoredKeybindingsRules()
      return undefined
    }
    applyKeybindingsRules(result.value.rules)
    clearStoredKeybindingsRules()
    return undefined
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
  persistRulesToServer(upsertKeybindingRule(current, next, input.replace))
}

export const removeKeybinding = (target: KeybindingRule): void => {
  const current = persistedRulesOrDefaults(appAtomRegistry.get(keybindingsRulesAtom))
  const without = removeKeybindingRule(current, target)
  if (without.some((entry) => entry.command === target.command)) {
    persistRulesToServer(without)
    return
  }
  persistRulesToServer([...without, keybindingTombstone(target.command)])
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
  persistRulesToServer([])
}

export const replaceKeybindingsRules = (rules: ReadonlyArray<KeybindingRule>): void => {
  persistRulesToServer(rules)
}

export const applyKeybindingsLiveEvent = (event: {
  readonly _tag: string
  readonly rules?: ReadonlyArray<FileKeybindingRule>
}): void => {
  if (event._tag !== "keybindings-updated" || event.rules === undefined) {
    return
  }
  applyKeybindingsRules(event.rules)
}

export type { KeybindingRule, ResolvedKeybindings, ResolvedKeybindingsConfig }
