import type { ThreadId } from "@noyau/contracts/ids"
import { Atom } from "effect/unstable/reactivity"

import {
  nextVisitedAtMs,
  persistThreadVisits,
  readStoredThreadVisits,
  type ThreadVisits,
} from "@/lib/thread-visits"
import { appAtomRegistry } from "@/state/atom-registry"
import { persistWritableAtom } from "@/state/persist"

export const threadVisitsAtom = Atom.make<ThreadVisits>(new Map()).pipe(
  Atom.keepAlive,
  Atom.withLabel("chrome:thread-visits"),
)

export const visitAtom = Atom.family((threadId: ThreadId) =>
  Atom.make((get): number | undefined => get(threadVisitsAtom).get(threadId)).pipe(
    Atom.withLabel(`chrome:visit:${threadId}`),
  ),
)

let initialized = false

export const initializeThreadVisits = (): void => {
  if (initialized) {
    return
  }
  initialized = true
  persistWritableAtom(threadVisitsAtom, {
    read: readStoredThreadVisits,
    write: persistThreadVisits,
  })
}

export const getThreadVisits = (): ThreadVisits => appAtomRegistry.get(threadVisitsAtom)

export const markThreadVisited = (threadId: ThreadId, visitedAtMs: number): void => {
  const current = appAtomRegistry.get(threadVisitsAtom)
  const nextMs = nextVisitedAtMs(current.get(threadId), visitedAtMs)
  if (nextMs === undefined || nextMs === current.get(threadId)) {
    return
  }
  const next = new Map(current)
  next.set(threadId, nextMs)
  appAtomRegistry.set(threadVisitsAtom, next)
}
