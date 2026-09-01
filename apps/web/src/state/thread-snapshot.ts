import type { ThreadSnapshot } from "@noyau/contracts/entities/thread-snapshot"
import type { EventEnvelope } from "@noyau/contracts/events"
import type { Sequence, ThreadId } from "@noyau/contracts/ids"
import { Atom } from "effect/unstable/reactivity"

import { applyThreadEnvelope } from "@/lib/thread-transcript"
import { appAtomRegistry } from "@/state/atom-registry"

/** Keep a recently visited Thread body warm across short switch gaps. */
export const THREAD_SNAPSHOT_IDLE_TTL_MS = 5 * 60_000

export const emptyThreadSnapshotAtom = Atom.make<ThreadSnapshot | undefined>(undefined).pipe(
  Atom.withLabel("thread:snapshot:empty"),
)

export const threadSnapshotAtom = Atom.family((threadId: ThreadId) =>
  Atom.make<ThreadSnapshot | undefined>(undefined).pipe(
    Atom.setIdleTTL(THREAD_SNAPSHOT_IDLE_TTL_MS),
    Atom.withLabel(`thread:snapshot:${threadId}`),
  ),
)

export const getThreadSnapshot = (threadId: ThreadId): ThreadSnapshot | undefined =>
  appAtomRegistry.get(threadSnapshotAtom(threadId))

export const threadSnapshotNeedsLoad = (threadId: ThreadId | undefined): boolean => {
  if (threadId === undefined) {
    return false
  }
  return getThreadSnapshot(threadId) === undefined
}

export const threadSnapshotResumeSequence = (threadId: ThreadId): Sequence | undefined =>
  getThreadSnapshot(threadId)?.snapshotSequence

/** Keep a newer live snapshot when a slower prefetch lands late. */
export const canReplaceThreadSnapshot = (
  current: ThreadSnapshot | undefined,
  incoming: ThreadSnapshot,
): boolean => current === undefined || incoming.snapshotSequence >= current.snapshotSequence

export const replaceThreadSnapshot = (snapshot: ThreadSnapshot): boolean => {
  const current = appAtomRegistry.get(threadSnapshotAtom(snapshot.thread.id))
  if (!canReplaceThreadSnapshot(current, snapshot)) {
    return false
  }
  appAtomRegistry.set(threadSnapshotAtom(snapshot.thread.id), snapshot)
  return true
}

export const reduceThreadSnapshotEnvelope = (
  threadId: ThreadId,
  envelope: EventEnvelope,
): ThreadSnapshot | undefined => {
  const current = appAtomRegistry.get(threadSnapshotAtom(threadId))
  if (current === undefined || current.thread.id !== threadId) {
    return undefined
  }
  const next = applyThreadEnvelope(current, envelope)
  if (next === undefined) {
    if (envelope.event._tag === "thread.deleted" && envelope.event.threadId === threadId) {
      appAtomRegistry.set(threadSnapshotAtom(threadId), undefined)
      return undefined
    }
    return current
  }
  appAtomRegistry.set(threadSnapshotAtom(threadId), next)
  return next
}
