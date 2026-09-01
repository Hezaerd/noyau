import type { ThreadSnapshot } from "@noyau/contracts/entities/thread-snapshot"
import type { EventEnvelope } from "@noyau/contracts/events"
import type { Sequence, ThreadId } from "@noyau/contracts/ids"
import type { ShellLiveEvent, ThreadShell } from "@noyau/contracts/shell"
import type { ThreadAssistantLive } from "@noyau/contracts/thread/live"

import { subscribeThread, type SubscriptionStatus } from "@/lib/control-plane"
import { appAtomRegistry } from "@/state/atom-registry"
import { patchAppliedShellThread } from "@/state/shell"
import {
  getThreadSnapshot,
  reduceThreadSnapshotEnvelope,
  replaceThreadSnapshot,
  threadSnapshotAtom,
  threadSnapshotResumeSequence,
} from "@/state/thread-snapshot"

export interface ThreadSnapshotSubscriptionCallbacks {
  readonly onSnapshot: (snapshot: ThreadSnapshot) => void
  readonly onEvent: (event: EventEnvelope) => void
  readonly onStatus: (status: SubscriptionStatus) => void
  readonly onLive?: (live: ThreadAssistantLive) => void
}

type ThreadSnapshotSubscriber = (
  threadId: ThreadId,
  afterSequence: Sequence | undefined,
  callbacks: ThreadSnapshotSubscriptionCallbacks,
) => () => void

interface WarmTarget {
  readonly latestTurn: ThreadShell["latestTurn"]
  readonly sequence?: Sequence
}

interface ThreadSnapshotWriter {
  background: boolean
  lastStatus: SubscriptionStatus | undefined
  readonly listeners: Set<ThreadSnapshotSubscriptionCallbacks>
  readonly releaseAtom: () => void
  stop: (() => void) | undefined
  warmTarget: WarmTarget | undefined
}

const writers = new Map<ThreadId, ThreadSnapshotWriter>()
let startSubscription: ThreadSnapshotSubscriber = subscribeThread

const latestTurnMatches = (
  snapshot: ThreadSnapshot | undefined,
  latestTurn: ThreadShell["latestTurn"],
): boolean =>
  snapshot?.thread.latestTurn?.turnId === latestTurn?.turnId &&
  snapshot?.thread.latestTurn?.state === latestTurn?.state &&
  (snapshot?.thread.latestTurn?.completedAt === null) === (latestTurn?.completedAt === null)

const isRunningTurn = (latestTurn: ThreadShell["latestTurn"]): boolean =>
  latestTurn?.state === "running" && latestTurn.completedAt === null

/** Repair chrome state when a detailed Thread stream observes the terminal event first. */
export const reconcileThreadShellFromSnapshot = (snapshot: ThreadSnapshot): boolean => {
  const latestTurn = snapshot.thread.latestTurn
  if (latestTurn === null || latestTurn.state === "running" || latestTurn.completedAt === null) {
    return false
  }
  return patchAppliedShellThread(snapshot.thread.id, (thread) => {
    if (!isRunningTurn(thread.latestTurn) || thread.latestTurn?.turnId !== latestTurn.turnId) {
      return thread
    }
    return {
      ...thread,
      latestTurn,
      sessionStatus: snapshot.session?.status ?? null,
      lastError: snapshot.session?.lastError ?? null,
      updatedAt: snapshot.thread.updatedAt,
    }
  })
}

const stopUnretainedWriter = (threadId: ThreadId, writer: ThreadSnapshotWriter): void => {
  if (writer.background || writer.listeners.size > 0 || writers.get(threadId) !== writer) {
    return
  }
  writers.delete(threadId)
  writer.stop?.()
  writer.releaseAtom()
}

const settleBackgroundWriter = (threadId: ThreadId, writer: ThreadSnapshotWriter): void => {
  const target = writer.warmTarget
  if (target === undefined) {
    return
  }
  const snapshot = getThreadSnapshot(threadId)
  if (!latestTurnMatches(snapshot, target.latestTurn)) {
    return
  }
  if (target.sequence !== undefined && (snapshot?.snapshotSequence ?? 0) < target.sequence) {
    return
  }
  writer.background = false
  writer.warmTarget = undefined
  stopUnretainedWriter(threadId, writer)
}

const ensureWriter = (threadId: ThreadId): ThreadSnapshotWriter => {
  const current = writers.get(threadId)
  if (current !== undefined) {
    return current
  }
  const writer: ThreadSnapshotWriter = {
    background: false,
    lastStatus: undefined,
    listeners: new Set(),
    releaseAtom: appAtomRegistry.subscribe(threadSnapshotAtom(threadId), () => undefined),
    stop: undefined,
    warmTarget: undefined,
  }
  writers.set(threadId, writer)
  const stop = startSubscription(threadId, threadSnapshotResumeSequence(threadId), {
    onSnapshot: (incoming) => {
      if (writers.get(threadId) !== writer) {
        return
      }
      replaceThreadSnapshot(incoming)
      const snapshot = getThreadSnapshot(threadId)
      if (snapshot !== undefined) {
        reconcileThreadShellFromSnapshot(snapshot)
        for (const listener of writer.listeners) {
          listener.onSnapshot(snapshot)
        }
      }
      settleBackgroundWriter(threadId, writer)
    },
    onEvent: (event) => {
      if (writers.get(threadId) !== writer) {
        return
      }
      const snapshot = reduceThreadSnapshotEnvelope(threadId, event)
      if (snapshot !== undefined) {
        reconcileThreadShellFromSnapshot(snapshot)
      }
      for (const listener of writer.listeners) {
        listener.onEvent(event)
      }
      settleBackgroundWriter(threadId, writer)
    },
    onLive: (live) => {
      if (writers.get(threadId) === writer) {
        for (const listener of writer.listeners) {
          listener.onLive?.(live)
        }
      }
    },
    onStatus: (status) => {
      if (writers.get(threadId) === writer) {
        writer.lastStatus = status
        for (const listener of writer.listeners) {
          listener.onStatus(status)
        }
      }
    },
  })
  writer.stop = stop
  if (writers.get(threadId) !== writer) {
    stop()
  }
  return writer
}

const keepRunningThreadWarm = (threadId: ThreadId): void => {
  const writer = ensureWriter(threadId)
  writer.background = true
  writer.warmTarget = undefined
}

const finishWarmingThread = (
  threadId: ThreadId,
  latestTurn: ThreadShell["latestTurn"],
  sequence?: Sequence,
): void => {
  const snapshot = getThreadSnapshot(threadId)
  if (latestTurnMatches(snapshot, latestTurn)) {
    const writer = writers.get(threadId)
    if (writer !== undefined) {
      writer.background = false
      writer.warmTarget = undefined
      stopUnretainedWriter(threadId, writer)
    }
    return
  }
  const writer = ensureWriter(threadId)
  writer.background = true
  writer.warmTarget = sequence === undefined ? { latestTurn } : { latestTurn, sequence }
  settleBackgroundWriter(threadId, writer)
}

/** Keep every running Thread body current even while another route is visible. */
export const syncWarmThreadSnapshots = (threads: ReadonlyArray<ThreadShell>): void => {
  const shellsById = new Map(threads.map((thread) => [thread.id, thread]))
  for (const thread of threads) {
    if (isRunningTurn(thread.latestTurn)) {
      keepRunningThreadWarm(thread.id)
    }
  }
  for (const [threadId, writer] of writers) {
    if (!writer.background) {
      continue
    }
    const thread = shellsById.get(threadId)
    if (thread === undefined) {
      writer.background = false
      writer.warmTarget = undefined
      stopUnretainedWriter(threadId, writer)
      continue
    }
    if (!isRunningTurn(thread.latestTurn)) {
      finishWarmingThread(threadId, thread.latestTurn)
    }
  }
}

/** Follow live shell transitions into and out of background warming. */
export const syncWarmThreadSnapshotEvent = (event: ShellLiveEvent): void => {
  if (event._tag === "thread-removed") {
    const writer = writers.get(event.threadId)
    if (writer !== undefined) {
      writer.background = false
      writer.warmTarget = undefined
      stopUnretainedWriter(event.threadId, writer)
    }
    return
  }
  if (event._tag !== "thread-upserted" || event.thread.latestTurn === null) {
    return
  }
  if (isRunningTurn(event.thread.latestTurn)) {
    keepRunningThreadWarm(event.thread.id)
    return
  }
  finishWarmingThread(event.thread.id, event.thread.latestTurn, event.sequence)
}

/** Share the warm writer with the mounted Thread page instead of opening a duplicate stream. */
export const retainThreadSnapshotSubscription = (
  threadId: ThreadId,
  callbacks: ThreadSnapshotSubscriptionCallbacks,
): (() => void) => {
  const writer = ensureWriter(threadId)
  writer.listeners.add(callbacks)
  const cached = getThreadSnapshot(threadId)
  if (cached !== undefined) {
    callbacks.onSnapshot(cached)
  }
  if (writer.lastStatus !== undefined) {
    callbacks.onStatus(writer.lastStatus)
  }
  return () => {
    writer.listeners.delete(callbacks)
    stopUnretainedWriter(threadId, writer)
  }
}

export const setThreadSnapshotSubscriberForTests = (subscriber: ThreadSnapshotSubscriber): void => {
  startSubscription = subscriber
}

export const resetThreadSnapshotSubscriptions = (): void => {
  for (const [threadId, writer] of writers) {
    writers.delete(threadId)
    writer.stop?.()
    writer.releaseAtom()
  }
  startSubscription = subscribeThread
}

export const resetThreadSnapshotSubscriptionsForTests = resetThreadSnapshotSubscriptions
