import { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { Schema } from "effect"
import { afterEach, describe, expect, it } from "vite-plus/test"

import {
  readThreadSnapshotCache,
  removeThreadSnapshotCache,
  resetThreadSnapshotCache,
  THREAD_SNAPSHOT_CACHE_MAX_ENTRIES,
  THREAD_SNAPSHOT_CACHE_TTL_MS,
  threadSnapshotCacheSize,
  writeThreadSnapshotCache,
} from "../src/lib/thread-snapshot-cache"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")

const makeSnapshot = (threadId: string, sequence: number): ThreadSnapshot =>
  Schema.decodeSync(ThreadSnapshot)({
    snapshotSequence: sequence,
    thread: {
      id: threadId,
      projectId,
      title: `Thread ${threadId}`,
      provider: "cursor",
      runtimeMode: "auto",
      modelSelection: null,
      status: "active",
      session: null,
      latestTurn: null,
      createdAt: "2026-08-19T12:00:00.000Z",
      updatedAt: "2026-08-19T12:00:00.000Z",
    },
    session: null,
    turns: [],
    transcript: [],
  })

afterEach(() => {
  resetThreadSnapshotCache()
})

describe("thread snapshot cache", () => {
  it("returns a warm snapshot and refreshes LRU order on read", () => {
    const first = ThreadId.make("20000000-0000-4000-8000-000000000001")
    const second = ThreadId.make("20000000-0000-4000-8000-000000000002")
    writeThreadSnapshotCache(makeSnapshot(first, 10), 1_000)
    writeThreadSnapshotCache(makeSnapshot(second, 11), 1_001)

    expect(readThreadSnapshotCache(first, 1_002)?.snapshotSequence).toBe(10)
    writeThreadSnapshotCache(
      makeSnapshot(ThreadId.make("20000000-0000-4000-8000-000000000003"), 12),
      1_003,
    )

    // first was touched by the read, so second is the oldest and gets evicted once we fill.
    for (let index = 4; index <= THREAD_SNAPSHOT_CACHE_MAX_ENTRIES + 1; index += 1) {
      const id = ThreadId.make(`20000000-0000-4000-8000-${String(index).padStart(12, "0")}`)
      writeThreadSnapshotCache(makeSnapshot(id, index), 1_000 + index)
    }

    expect(readThreadSnapshotCache(first, 2_000)?.snapshotSequence).toBe(10)
    expect(readThreadSnapshotCache(second, 2_000)).toBeUndefined()
    expect(threadSnapshotCacheSize(2_000)).toBe(THREAD_SNAPSHOT_CACHE_MAX_ENTRIES)
  })

  it("expires entries past the idle TTL", () => {
    const threadId = ThreadId.make("20000000-0000-4000-8000-000000000010")
    writeThreadSnapshotCache(makeSnapshot(threadId, 4), 0)

    expect(readThreadSnapshotCache(threadId, THREAD_SNAPSHOT_CACHE_TTL_MS)).toBeDefined()
    expect(readThreadSnapshotCache(threadId, THREAD_SNAPSHOT_CACHE_TTL_MS + 1)).toBeUndefined()
    expect(threadSnapshotCacheSize(THREAD_SNAPSHOT_CACHE_TTL_MS + 1)).toBe(0)
  })

  it("replaces an entry in place and supports explicit removal", () => {
    const threadId = ThreadId.make("20000000-0000-4000-8000-000000000020")
    writeThreadSnapshotCache(makeSnapshot(threadId, 1), 10)
    writeThreadSnapshotCache(makeSnapshot(threadId, 2), 20)

    expect(readThreadSnapshotCache(threadId, 21)?.snapshotSequence).toBe(2)
    expect(threadSnapshotCacheSize(21)).toBe(1)

    removeThreadSnapshotCache(threadId)
    expect(readThreadSnapshotCache(threadId, 22)).toBeUndefined()
  })
})
