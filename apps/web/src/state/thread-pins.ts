import type { ThreadId } from "@noyau/contracts/ids"
import { Atom } from "effect/unstable/reactivity"

import { persistThreadPins, readStoredThreadPins, type ThreadPins } from "@/lib/thread-pins"
import { appAtomRegistry } from "@/state/atom-registry"
import { persistWritableAtom } from "@/state/persist"

export const threadPinsAtom = Atom.make<ThreadPins>(new Map()).pipe(
  Atom.keepAlive,
  Atom.withLabel("chrome:thread-pins"),
)

export const pinAtom = Atom.family((threadId: ThreadId) =>
  Atom.make((get): boolean => get(threadPinsAtom).has(threadId)).pipe(
    Atom.withLabel(`chrome:pin:${threadId}`),
  ),
)

let initialized = false

export const initializeThreadPins = (): void => {
  if (initialized) {
    return
  }
  initialized = true
  persistWritableAtom(threadPinsAtom, {
    read: readStoredThreadPins,
    write: persistThreadPins,
  })
}

export const getThreadPins = (): ThreadPins => appAtomRegistry.get(threadPinsAtom)

export const setThreadPinned = (
  threadId: ThreadId,
  pinned: boolean,
  pinnedAtMs: number = Date.now(),
): void => {
  const current = appAtomRegistry.get(threadPinsAtom)
  if (pinned === current.has(threadId)) {
    return
  }
  const next = new Map(current)
  if (pinned) {
    if (!Number.isFinite(pinnedAtMs)) {
      return
    }
    next.set(threadId, pinnedAtMs)
  } else {
    next.delete(threadId)
  }
  appAtomRegistry.set(threadPinsAtom, next)
}

export const toggleThreadPinned = (
  threadId: ThreadId,
  pinnedAtMs: number = Date.now(),
): boolean => {
  const nextPinned = !appAtomRegistry.get(threadPinsAtom).has(threadId)
  setThreadPinned(threadId, nextPinned, pinnedAtMs)
  return nextPinned
}
