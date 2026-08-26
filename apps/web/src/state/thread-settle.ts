import { Atom } from "effect/unstable/reactivity"

import {
  decodeAutoSettleAfterDaysValue,
  DEFAULT_AUTO_SETTLE_AFTER_DAYS,
  DEFAULT_AUTO_SETTLE_ON_MERGE,
  persistAutoSettleAfterDays,
  persistAutoSettleOnMerge,
  readStoredAutoSettleAfterDays,
  readStoredAutoSettleOnMerge,
} from "@/lib/thread-settle-preference"
import {
  DEFAULT_SETTLED_SHELF_EXPANDED,
  persistSettledShelfExpanded,
  readStoredSettledShelfExpanded,
} from "@/lib/thread-sidebar-shelf"
import { appAtomRegistry } from "@/state/atom-registry"
import { persistWritableAtom } from "@/state/persist"

export const autoSettleOnMergeAtom = Atom.make(DEFAULT_AUTO_SETTLE_ON_MERGE).pipe(
  Atom.keepAlive,
  Atom.withLabel("chrome:auto-settle-on-merge"),
)

export const autoSettleAfterDaysAtom = Atom.make<number | null>(
  DEFAULT_AUTO_SETTLE_AFTER_DAYS,
).pipe(Atom.keepAlive, Atom.withLabel("chrome:auto-settle-after-days"))

export const settledShelfExpandedAtom = Atom.make(DEFAULT_SETTLED_SHELF_EXPANDED).pipe(
  Atom.keepAlive,
  Atom.withLabel("chrome:settled-shelf-expanded"),
)

let initialized = false

export const initializeThreadSettlePreference = (): void => {
  if (initialized) {
    return
  }
  initialized = true
  persistWritableAtom(autoSettleOnMergeAtom, {
    read: readStoredAutoSettleOnMerge,
    write: persistAutoSettleOnMerge,
  })
  persistWritableAtom(autoSettleAfterDaysAtom, {
    read: readStoredAutoSettleAfterDays,
    write: persistAutoSettleAfterDays,
  })
  persistWritableAtom(settledShelfExpandedAtom, {
    read: readStoredSettledShelfExpanded,
    write: persistSettledShelfExpanded,
  })
}

export const getAutoSettleOnMergeEnabled = (): boolean => appAtomRegistry.get(autoSettleOnMergeAtom)

export const getAutoSettleAfterDays = (): number | null =>
  appAtomRegistry.get(autoSettleAfterDaysAtom)

export const setAutoSettleOnMergeEnabled = (enabled: boolean): void => {
  if (enabled === appAtomRegistry.get(autoSettleOnMergeAtom)) {
    return
  }
  appAtomRegistry.set(autoSettleOnMergeAtom, enabled)
}

export const setAutoSettleAfterDays = (days: number | null): void => {
  const next =
    days === null ? null : (decodeAutoSettleAfterDaysValue(days) ?? getAutoSettleAfterDays())
  if (next === appAtomRegistry.get(autoSettleAfterDaysAtom)) {
    return
  }
  appAtomRegistry.set(autoSettleAfterDaysAtom, next)
}

export const setSettledShelfExpanded = (expanded: boolean): void => {
  if (expanded === appAtomRegistry.get(settledShelfExpandedAtom)) {
    return
  }
  appAtomRegistry.set(settledShelfExpandedAtom, expanded)
}

export const resetThreadSettlePreference = (): void => {
  appAtomRegistry.set(autoSettleOnMergeAtom, DEFAULT_AUTO_SETTLE_ON_MERGE)
  appAtomRegistry.set(autoSettleAfterDaysAtom, DEFAULT_AUTO_SETTLE_AFTER_DAYS)
}
