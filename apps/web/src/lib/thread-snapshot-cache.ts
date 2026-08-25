import type { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import type { ThreadId } from "@noyau/protocol/ids"

/** Keep recently visited Thread bodies warm across short switch gaps. */
export const THREAD_SNAPSHOT_CACHE_TTL_MS = 5 * 60_000

/** Cap retained transcripts so long sessions do not retain unbounded memory. */
export const THREAD_SNAPSHOT_CACHE_MAX_ENTRIES = 12

/** t3code `shouldPersistThread`: skip encoding while a Session is live. */
export const shouldPersistThreadSnapshot = (snapshot: ThreadSnapshot): boolean => {
  const status = snapshot.session?.status
  return status !== "starting" && status !== "running"
}

type CacheEntry = {
  readonly snapshot: ThreadSnapshot
  readonly cachedAt: number
}

const entries = new Map<string, CacheEntry>()

const isFresh = (entry: CacheEntry, now: number): boolean =>
  now - entry.cachedAt <= THREAD_SNAPSHOT_CACHE_TTL_MS

const touch = (threadId: string, entry: CacheEntry): void => {
  entries.delete(threadId)
  entries.set(threadId, entry)
}

const evictExpired = (now: number): void => {
  for (const [threadId, entry] of entries) {
    if (!isFresh(entry, now)) {
      entries.delete(threadId)
    }
  }
}

const evictOverflow = (): void => {
  while (entries.size > THREAD_SNAPSHOT_CACHE_MAX_ENTRIES) {
    const oldest = entries.keys().next().value
    if (oldest === undefined) {
      return
    }
    entries.delete(oldest)
  }
}

export const readThreadSnapshotCache = (
  threadId: ThreadId,
  now = Date.now(),
): ThreadSnapshot | undefined => {
  evictExpired(now)
  const entry = entries.get(threadId)
  if (entry === undefined) {
    return undefined
  }
  if (!isFresh(entry, now)) {
    entries.delete(threadId)
    return undefined
  }
  touch(threadId, entry)
  return entry.snapshot
}

export const writeThreadSnapshotCache = (snapshot: ThreadSnapshot, now = Date.now()): void => {
  if (!shouldPersistThreadSnapshot(snapshot)) {
    return
  }
  evictExpired(now)
  touch(snapshot.thread.id, { snapshot, cachedAt: now })
  evictOverflow()
}

export const removeThreadSnapshotCache = (threadId: ThreadId): void => {
  entries.delete(threadId)
}

export const resetThreadSnapshotCache = (): void => {
  entries.clear()
}

/** Test helper: current retention size after expiry sweeps. */
export const threadSnapshotCacheSize = (now = Date.now()): number => {
  evictExpired(now)
  return entries.size
}
