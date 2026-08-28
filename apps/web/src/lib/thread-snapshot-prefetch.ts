import type { ThreadSnapshot } from "@noyau/contracts/entities/thread-snapshot"
import type { ThreadId } from "@noyau/contracts/ids"

import { loadThreadSnapshot, type ControlPlaneResult } from "@/lib/control-plane"
import { getThreadSnapshot, replaceThreadSnapshot } from "@/state/thread-snapshot"

export const THREAD_SNAPSHOT_PREFETCH_DEBOUNCE_MS = 120

export type ThreadSnapshotLoader = (
  threadId: ThreadId,
) => Promise<ControlPlaneResult<ThreadSnapshot>>

let loadSnapshot: ThreadSnapshotLoader | undefined
let debounceTimer: ReturnType<typeof setTimeout> | undefined
let hoverTarget: ThreadId | undefined
let queued: ThreadId | undefined
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

const startLoad = (threadId: ThreadId): void => {
  if (getThreadSnapshot(threadId) !== undefined || inflightThreadId === threadId) {
    return
  }
  if (inflight !== undefined) {
    queued = threadId
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
      const next = queued
      queued = undefined
      if (next !== undefined) {
        startLoad(next)
      }
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
  if (getThreadSnapshot(threadId) !== undefined || inflightThreadId === threadId) {
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
  queued = undefined
  inflightThreadId = undefined
  inflight = undefined
  loadSnapshot = undefined
}
