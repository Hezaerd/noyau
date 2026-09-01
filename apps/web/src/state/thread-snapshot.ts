import type { ThreadSnapshot } from "@noyau/contracts/entities/thread-snapshot"
import type { EventEnvelope } from "@noyau/contracts/events"
import type { Sequence, ThreadId } from "@noyau/contracts/ids"
import type { ThreadShell } from "@noyau/contracts/shell"
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

const requiredThreadSnapshotSequenceAtom = Atom.family((threadId: ThreadId) =>
  Atom.make<Sequence | undefined>(undefined).pipe(
    Atom.setIdleTTL(THREAD_SNAPSHOT_IDLE_TTL_MS),
    Atom.withLabel(`thread:snapshot-required-sequence:${threadId}`),
  ),
)

export const getThreadSnapshot = (threadId: ThreadId): ThreadSnapshot | undefined =>
  appAtomRegistry.get(threadSnapshotAtom(threadId))

export const threadSnapshotNeedsLoad = (threadId: ThreadId | undefined): boolean => {
  if (threadId === undefined) {
    return false
  }
  const snapshot = getThreadSnapshot(threadId)
  const requiredSequence = appAtomRegistry.get(requiredThreadSnapshotSequenceAtom(threadId))
  return (
    snapshot === undefined ||
    (requiredSequence !== undefined && snapshot.snapshotSequence < requiredSequence)
  )
}

/** A stale warm snapshot must reopen from one atomic snapshot, not event-by-event catch-up. */
export const threadSnapshotResumeSequence = (threadId: ThreadId): Sequence | undefined =>
  threadSnapshotNeedsLoad(threadId) ? undefined : getThreadSnapshot(threadId)?.snapshotSequence

const latestTurnMatches = (
  snapshot: ThreadSnapshot | undefined,
  latestTurn: ThreadShell["latestTurn"],
): boolean =>
  snapshot?.thread.latestTurn?.turnId === latestTurn?.turnId &&
  snapshot?.thread.latestTurn?.state === latestTurn?.state

/**
 * Records the shell event that made a background Turn terminal. The shell event
 * is ordered after the transcript facts it summarizes, so its sequence is a
 * safe freshness watermark for the cached Thread body.
 */
export const requireTerminalThreadSnapshot = (thread: ThreadShell, sequence: Sequence): boolean => {
  if (thread.latestTurn === null || thread.latestTurn.state === "running") {
    return false
  }
  const snapshot = getThreadSnapshot(thread.id)
  if (snapshot !== undefined && snapshot.snapshotSequence >= sequence) {
    return false
  }
  if (latestTurnMatches(snapshot, thread.latestTurn)) {
    return false
  }
  const atom = requiredThreadSnapshotSequenceAtom(thread.id)
  const current = appAtomRegistry.get(atom)
  if (current !== undefined && current >= sequence) {
    return false
  }
  appAtomRegistry.set(atom, sequence)
  return true
}

const clearSatisfiedRequiredSequence = (snapshot: ThreadSnapshot): void => {
  const atom = requiredThreadSnapshotSequenceAtom(snapshot.thread.id)
  const required = appAtomRegistry.get(atom)
  if (required !== undefined && snapshot.snapshotSequence >= required) {
    appAtomRegistry.set(atom, undefined)
  }
}

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
  clearSatisfiedRequiredSequence(snapshot)
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
  clearSatisfiedRequiredSequence(next)
  return next
}
