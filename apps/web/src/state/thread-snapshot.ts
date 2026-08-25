import type { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import type { EventEnvelope } from "@noyau/protocol/events"
import type { ThreadId } from "@noyau/protocol/ids"
import { Atom } from "effect/unstable/reactivity"

import { THREAD_SNAPSHOT_CACHE_TTL_MS } from "@/lib/thread-snapshot-cache"
import { applyThreadEnvelope } from "@/lib/thread-transcript"
import { appAtomRegistry } from "@/state/atom-registry"

export const emptyThreadSnapshotAtom = Atom.make<ThreadSnapshot | undefined>(undefined).pipe(
  Atom.withLabel("thread:snapshot:empty"),
)

export const threadSnapshotAtom = Atom.family((threadId: ThreadId) =>
  Atom.make<ThreadSnapshot | undefined>(undefined).pipe(
    Atom.setIdleTTL(THREAD_SNAPSHOT_CACHE_TTL_MS),
    Atom.withLabel(`thread:snapshot:${threadId}`),
  ),
)

export const getThreadSnapshot = (threadId: ThreadId): ThreadSnapshot | undefined =>
  appAtomRegistry.get(threadSnapshotAtom(threadId))

export const replaceThreadSnapshot = (snapshot: ThreadSnapshot): void => {
  appAtomRegistry.set(threadSnapshotAtom(snapshot.thread.id), snapshot)
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
    return current
  }
  appAtomRegistry.set(threadSnapshotAtom(threadId), next)
  return next
}
