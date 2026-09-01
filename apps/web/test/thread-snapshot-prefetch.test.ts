import { ThreadSnapshot } from "@noyau/contracts/entities/thread-snapshot"
import { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { Deferred, Effect, Schema } from "effect"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { invalidInputFailure } from "../src/lib/app-failure"
import {
  prefetchThreadSnapshot,
  resetThreadSnapshotPrefetchForTests,
  setThreadSnapshotPrefetchLoaderForTests,
  THREAD_SNAPSHOT_PREFETCH_DEBOUNCE_MS,
} from "../src/lib/thread-snapshot-prefetch"
import { resetAppAtomRegistryForTests } from "../src/state/atom-registry"
import { getThreadSnapshot, replaceThreadSnapshot } from "../src/state/thread-snapshot"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadA = ThreadId.make("20000000-0000-4000-8000-000000000001")
const threadB = ThreadId.make("20000000-0000-4000-8000-000000000002")

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
      listedAt: "2026-08-19T12:00:00.000Z",
      updatedAt: "2026-08-19T12:00:00.000Z",
    },
    session: null,
    turns: [],
    transcript: [],
  })

afterEach(() => {
  resetThreadSnapshotPrefetchForTests()
  resetAppAtomRegistryForTests()
  vi.useRealTimers()
})

describe("prefetchThreadSnapshot", () => {
  it("does not fetch before the debounce settles", () => {
    vi.useFakeTimers()
    const load = vi.fn(() =>
      Promise.resolve({ ok: true as const, value: makeSnapshot(threadA, 1) }),
    )
    setThreadSnapshotPrefetchLoaderForTests(load)

    prefetchThreadSnapshot(threadA)
    expect(load).not.toHaveBeenCalled()
  })

  it("loads the last hovered Thread after the debounce", async () => {
    vi.useFakeTimers()
    const load = vi.fn((threadId: ThreadId) =>
      Promise.resolve({ ok: true as const, value: makeSnapshot(threadId, 1) }),
    )
    setThreadSnapshotPrefetchLoaderForTests(load)

    prefetchThreadSnapshot(threadA)
    await vi.advanceTimersByTimeAsync(THREAD_SNAPSHOT_PREFETCH_DEBOUNCE_MS - 1)
    prefetchThreadSnapshot(threadB)
    await vi.advanceTimersByTimeAsync(THREAD_SNAPSHOT_PREFETCH_DEBOUNCE_MS)

    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith(threadB)
    expect(getThreadSnapshot(threadB)?.snapshotSequence).toBe(1)
    expect(getThreadSnapshot(threadA)).toBeUndefined()
  })

  it("skips a Thread already warm in the idle cache", async () => {
    vi.useFakeTimers()
    const load = vi.fn(() =>
      Promise.resolve({ ok: true as const, value: makeSnapshot(threadA, 9) }),
    )
    setThreadSnapshotPrefetchLoaderForTests(load)
    replaceThreadSnapshot(makeSnapshot(threadA, 3))

    prefetchThreadSnapshot(threadA)
    await vi.advanceTimersByTimeAsync(THREAD_SNAPSHOT_PREFETCH_DEBOUNCE_MS)

    expect(load).not.toHaveBeenCalled()
    expect(getThreadSnapshot(threadA)?.snapshotSequence).toBe(3)
  })

  it("queues the next hover until the in-flight snapshot returns", async () => {
    vi.useFakeTimers()
    const pendingA = Deferred.makeUnsafe<{
      readonly ok: true
      readonly value: ThreadSnapshot
    }>()
    const load = vi.fn((threadId: ThreadId) => {
      if (threadId === threadA) {
        return Effect.runPromise(Deferred.await(pendingA))
      }
      return Promise.resolve({ ok: true as const, value: makeSnapshot(threadId, 2) })
    })
    setThreadSnapshotPrefetchLoaderForTests(load)

    prefetchThreadSnapshot(threadA)
    await vi.advanceTimersByTimeAsync(THREAD_SNAPSHOT_PREFETCH_DEBOUNCE_MS)
    prefetchThreadSnapshot(threadB)
    await vi.advanceTimersByTimeAsync(THREAD_SNAPSHOT_PREFETCH_DEBOUNCE_MS)

    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith(threadA)

    Effect.runSync(
      Deferred.succeed(pendingA, { ok: true as const, value: makeSnapshot(threadA, 1) }),
    )
    await vi.advanceTimersByTimeAsync(0)

    expect(load).toHaveBeenCalledTimes(2)
    expect(load).toHaveBeenLastCalledWith(threadB)
    expect(getThreadSnapshot(threadA)?.snapshotSequence).toBe(1)
    expect(getThreadSnapshot(threadB)?.snapshotSequence).toBe(2)
  })

  it("swallows a failed speculative fetch", async () => {
    vi.useFakeTimers()
    const load = vi.fn(() =>
      Promise.resolve({ ok: false as const, failure: invalidInputFailure("snapshot") }),
    )
    setThreadSnapshotPrefetchLoaderForTests(load)

    prefetchThreadSnapshot(threadA)
    await vi.advanceTimersByTimeAsync(THREAD_SNAPSHOT_PREFETCH_DEBOUNCE_MS)

    expect(getThreadSnapshot(threadA)).toBeUndefined()
  })
})
