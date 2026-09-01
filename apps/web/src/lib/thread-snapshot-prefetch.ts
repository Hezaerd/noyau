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
const queued = new Set<ThreadId>()
let inflightThreadId: ThreadId | undefined
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

const startNextQueuedLoad = (): void => {
  if (inflight !== undefined) {
    return
  }
  const nextThreadId = queued.values().next().value
  if (nextThreadId === undefined) {
    return
  }
  queued.delete(nextThreadId)
  startLoad(nextThreadId)
}

const startLoad = (threadId: ThreadId): void => {
  if (!threadSnapshotNeedsLoad(threadId)) {
    startNextQueuedLoad()
    return
  }
  if (inflightThreadId === threadId) {
    return
  }
  if (inflight !== undefined) {
    queued.add(threadId)
    return
  }
  const started = generation
  inflightThreadId = threadId
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

export const setThreadSnapshotPrefetchLoaderForTests = (loader: ThreadSnapshotLoader): void => {
  loadSnapshot = loader
}

export const resetThreadSnapshotPrefetchForTests = (): void => {
  generation += 1
  clearDebounce()
  hoverTarget = undefined
  queued.clear()
  inflightThreadId = undefined
  inflight = undefined
  loadSnapshot = undefined
}
