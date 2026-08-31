import type { ThreadId } from "@noyau/contracts/ids"
import { Atom } from "effect/unstable/reactivity"

import { appAtomRegistry } from "@/state/atom-registry"

export const threadComposerOpenByIdAtom = Atom.make<ReadonlyMap<ThreadId, boolean>>(new Map()).pipe(
  Atom.keepAlive,
  Atom.withLabel("chrome:thread-composer-open"),
)

export const threadComposerOpenAtom = Atom.family((threadId: ThreadId) =>
  Atom.make((get): boolean => get(threadComposerOpenByIdAtom).get(threadId) ?? true).pipe(
    Atom.withLabel(`chrome:thread-composer-open:${threadId}`),
  ),
)

export const isThreadComposerOpen = (threadId: ThreadId): boolean =>
  appAtomRegistry.get(threadComposerOpenAtom(threadId))

export const setThreadComposerOpen = (threadId: ThreadId, open: boolean): void => {
  const current = appAtomRegistry.get(threadComposerOpenByIdAtom)
  if ((current.get(threadId) ?? true) === open) {
    return
  }
  const next = new Map(current)
  if (open) {
    next.delete(threadId)
  } else {
    next.set(threadId, false)
  }
  appAtomRegistry.set(threadComposerOpenByIdAtom, next)
}

export const toggleThreadComposer = (threadId: ThreadId): boolean => {
  const nextOpen = !isThreadComposerOpen(threadId)
  setThreadComposerOpen(threadId, nextOpen)
  return nextOpen
}
