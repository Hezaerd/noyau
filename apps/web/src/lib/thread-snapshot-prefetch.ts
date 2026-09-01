import type { ThreadSnapshot } from "@noyau/contracts/entities/thread-snapshot"
import type { ThreadId } from "@noyau/contracts/ids"

import { loadThreadSnapshot, type ControlPlaneResult } from "@/lib/control-plane"
import { replaceThreadSnapshot, threadSnapshotNeedsLoad } from "@/state/thread-snapshot"

export const THREAD_SNAPSHOT_PREFETCH_DEBOUNCE_MS = 120

export type ThreadSnapshotLoader = (
  threadId: ThreadId,
) => Promise<ControlPlaneResult<ThreadSnapshot>>

let loadSnapshot: ThreadSnapshotLoader | undefined
let debounceTimer: ReturnType<typeof setTimeout> | undefined
let hoverTarget: ThreadId | undefined
const queued = new Map<ThreadId, boolean>()
let inflightThreadId: ThreadId | undefined
let inflightForce = false
let inflight: Promise<void> | undefined
let generation = 0

const resolveLoader = (): ThreadSnapshotLoader => loadSnapshot ?? loadThreadSnapshot

const clearDebounce = (): void => {
  if (debounceTimer === undefined) {
    return
  }
  clearTimeout(debounceTimer)
  debounceTimer = undefined
}

const queueLoad = (threadId: ThreadId, force: boolean): void => {
  queued.set(threadId, (queued.get(threadId) ?? false) || force)
}

const startNextQueuedLoad = (): void => {
  if (inflight !== undefined) {
    return
  }
  const next = queued.entries().next().value
  if (next === undefined) {
    return
  }
  const [nextThreadId, nextForce] = next
  queued.delete(nextThreadId)
  startLoad(nextThreadId, nextForce)
}

const startLoad = (threadId: ThreadId, force = false): void => {
  if (!force && !threadSnapshotNeedsLoad(threadId)) {
    startNextQueuedLoad()
    return
  }
  if (inflightThreadId === threadId) {
    if (force && !inflightForce) {
      queueLoad(threadId, true)
    }
    return
  }
  if (inflight !== undefined) {
    queueLoad(threadId, force)
    return
  }
  const started = generation
  inflightThreadId = threadId
  inflightForce = force
  inflight = resolveLoader()(threadId)
    .then((result) => {
      if (started === generation && result.ok) {
        replaceThreadSnapshot(result.value)
      }
      return undefined
    })
    .catch(() => undefined)
    .finally(() => {
      if (started !== generation) {
        return
      }
      inflightThreadId = undefined
      inflightForce = false
      inflight = undefined
      startNextQueuedLoad()
    })
}

const commitHoverTarget = (): void => {
  debounceTimer = undefined
  const threadId = hoverTarget
  hoverTarget = undefined
  if (threadId !== undefined) {
    startLoad(threadId)
  }
}

/** One-shot snapshot into the idle cache. Does not open a live subscribe. */
export const prefetchThreadSnapshot = (threadId: ThreadId): void => {
  if (!threadSnapshotNeedsLoad(threadId) || inflightThreadId === threadId) {
    return
  }
  hoverTarget = threadId
  clearDebounce()
  debounceTimer = setTimeout(commitHoverTarget, THREAD_SNAPSHOT_PREFETCH_DEBOUNCE_MS)
}

/** Refresh a known-stale body immediately when its shell Turn settles. */
export const refreshThreadSnapshot = (threadId: ThreadId): void => {
  startLoad(threadId, true)
}

export const setThreadSnapshotPrefetchLoaderForTests = (loader: ThreadSnapshotLoader): void => {
  loadSnapshot = loader
}

export const resetThreadSnapshotPrefetchForTests = (): void => {
  generation += 1
  clearDebounce()
  hoverTarget = undefined
  queued.clear()
  inflightThreadId = undefined
  inflightForce = false
  inflight = undefined
  loadSnapshot = undefined
}
