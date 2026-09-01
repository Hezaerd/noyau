import { ThreadSnapshot } from "@noyau/contracts/entities/thread-snapshot"
import { DomainEvent, EventEnvelope } from "@noyau/contracts/events"
import { ProjectId, Sequence, ThreadId, TurnId } from "@noyau/contracts/ids"
import { ShellSnapshot, ThreadShell } from "@noyau/contracts/shell"
import { Schema } from "effect"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { resetAppAtomRegistryForTests } from "../src/state/atom-registry"
import { getAppliedShell, replaceAppliedShell } from "../src/state/shell"
import { getThreadSnapshot, replaceThreadSnapshot } from "../src/state/thread-snapshot"
import {
  resetThreadSnapshotSubscriptionsForTests,
  retainThreadSnapshotSubscription,
  setThreadSnapshotSubscriberForTests,
  syncWarmThreadSnapshotEvent,
  type ThreadSnapshotSubscriptionCallbacks,
} from "../src/state/thread-snapshot-subscriptions"
import { encodedTestEnvironment } from "./encoded-environment"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadA = ThreadId.make("20000000-0000-4000-8000-000000000001")
const threadB = ThreadId.make("20000000-0000-4000-8000-000000000002")
const turnA = TurnId.make("30000000-0000-4000-8000-000000000001")
const turnB = TurnId.make("30000000-0000-4000-8000-000000000002")

const turnIdOf = (threadId: ThreadId): TurnId => (threadId === threadA ? turnA : turnB)

const latestTurn = (threadId: ThreadId, state: "running" | "completed") => ({
  turnId: turnIdOf(threadId),
  state,
  requestedAt: "2026-09-01T12:00:00.000Z",
  startedAt: "2026-09-01T12:00:00.000Z",
  completedAt: state === "running" ? null : "2026-09-01T12:01:00.000Z",
})

const makeSnapshot = (
  threadId: ThreadId,
  sequence: number,
  state: "running" | "completed",
): ThreadSnapshot =>
  Schema.decodeSync(ThreadSnapshot)({
    snapshotSequence: sequence,
    thread: {
      id: threadId,
      projectId,
      title: `Thread ${threadId === threadA ? "A" : "B"}`,
      provider: "cursor",
      runtimeMode: "auto",
      modelSelection: null,
      status: "active",
      session: null,
      latestTurn: latestTurn(threadId, state),
      createdAt: "2026-09-01T12:00:00.000Z",
      listedAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:01:00.000Z",
    },
    session: null,
    turns: [
      {
        id: turnIdOf(threadId),
        threadId,
        ordinal: 1,
        state,
        requestedAt: "2026-09-01T12:00:00.000Z",
        startedAt: "2026-09-01T12:00:00.000Z",
        completedAt: state === "running" ? null : "2026-09-01T12:01:00.000Z",
      },
    ],
    transcript: [],
  })

const makeShell = (threadId: ThreadId, state: "running" | "completed"): ThreadShell =>
  Schema.decodeSync(ThreadShell)({
    id: threadId,
    projectId,
    title: `Thread ${threadId === threadA ? "A" : "B"}`,
    provider: "cursor",
    runtimeMode: "auto",
    modelSelection: null,
    status: "active",
    sessionStatus: state === "running" ? "running" : "ready",
    lastError: null,
    latestTurn: latestTurn(threadId, state),
    createdAt: "2026-09-01T12:00:00.000Z",
    listedAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:01:00.000Z",
  })

const terminalEnvelope = (threadId: ThreadId, sequence: number): EventEnvelope =>
  Schema.decodeSync(EventEnvelope)({
    eventId: `60000000-0000-4000-8000-00000000000${threadId === threadA ? "1" : "2"}`,
    projectId,
    actorId: "human:hezaerd",
    correlationId: "80000000-0000-4000-8000-000000000001",
    causationId: "90000000-0000-4000-8000-000000000001",
    occurredAt: "2026-09-01T12:01:00.000Z",
    schemaVersion: 1,
    sequence,
    event: Schema.encodeSync(DomainEvent)({
      _tag: "thread.turn.ended",
      threadId,
      turnId: turnIdOf(threadId),
      state: "completed",
    }),
  })

const installSubscriber = () => {
  const callbacks = new Map<ThreadId, ThreadSnapshotSubscriptionCallbacks>()
  const stops = new Map<ThreadId, ReturnType<typeof vi.fn>>()
  const subscribe = vi.fn(
    (
      threadId: ThreadId,
      _afterSequence: Sequence | undefined,
      next: ThreadSnapshotSubscriptionCallbacks,
    ) => {
      callbacks.set(threadId, next)
      const stop = vi.fn()
      stops.set(threadId, stop)
      return stop
    },
  )
  setThreadSnapshotSubscriberForTests(subscribe)
  return {
    callbackFor: (threadId: ThreadId) => {
      const callback = callbacks.get(threadId)
      if (callback === undefined) {
        throw new Error(`expected a subscription for ${threadId}`)
      }
      return callback
    },
    stopFor: (threadId: ThreadId) => {
      const stop = stops.get(threadId)
      if (stop === undefined) {
        throw new Error(`expected a stop callback for ${threadId}`)
      }
      return stop
    },
    subscribe,
  }
}

afterEach(() => {
  resetThreadSnapshotSubscriptionsForTests()
  resetAppAtomRegistryForTests()
})

describe("warm Thread snapshot subscriptions", () => {
  it("repairs a stale running shell row from a terminal detailed snapshot", () => {
    const harness = installSubscriber()
    const shell = {
      ...Schema.decodeSync(ShellSnapshot)({
        snapshotSequence: 1,
        environment: encodedTestEnvironment(),
        projects: [
          {
            id: projectId,
            name: "Noyau",
            workspaceRoot: "/tmp/noyau",
            defaultModelSelection: null,
            available: true,
            createdAt: "2026-09-01T12:00:00.000Z",
            updatedAt: "2026-09-01T12:00:00.000Z",
          },
        ],
        threads: [],
      }),
      threads: [makeShell(threadA, "running"), makeShell(threadB, "running")],
    }
    replaceAppliedShell(shell)

    for (const threadId of [threadA, threadB]) {
      syncWarmThreadSnapshotEvent({
        _tag: "thread-upserted",
        sequence: Sequence.make(2),
        thread: makeShell(threadId, "running"),
      })
      harness.callbackFor(threadId).onSnapshot(makeSnapshot(threadId, 5, "completed"))
    }

    expect(getAppliedShell()?.threads.map((thread) => thread.latestTurn?.state)).toEqual([
      "completed",
      "completed",
    ])
    expect(getAppliedShell()?.threads.map((thread) => thread.sessionStatus)).toEqual([null, null])
  })

  it("keeps a background Thread warm until its terminal event reaches the cache", () => {
    const harness = installSubscriber()

    syncWarmThreadSnapshotEvent({
      _tag: "thread-upserted",
      sequence: Sequence.make(2),
      thread: makeShell(threadA, "running"),
    })
    harness.callbackFor(threadA).onSnapshot(makeSnapshot(threadA, 2, "running"))

    syncWarmThreadSnapshotEvent({
      _tag: "thread-upserted",
      sequence: Sequence.make(5),
      thread: makeShell(threadA, "completed"),
    })
    expect(harness.stopFor(threadA)).not.toHaveBeenCalled()

    harness.callbackFor(threadA).onEvent(terminalEnvelope(threadA, 5))

    expect(getThreadSnapshot(threadA)?.thread.latestTurn?.state).toBe("completed")
    expect(harness.stopFor(threadA)).toHaveBeenCalledOnce()
  })

  it("reconnects a background writer when its Thread becomes visible", () => {
    const harness = installSubscriber()
    const onEvent = vi.fn()

    syncWarmThreadSnapshotEvent({
      _tag: "thread-upserted",
      sequence: Sequence.make(2),
      thread: makeShell(threadA, "running"),
    })
    const backgroundStop = harness.stopFor(threadA)
    const release = retainThreadSnapshotSubscription(threadA, {
      onSnapshot: vi.fn(),
      onEvent,
      onStatus: vi.fn(),
    })

    expect(backgroundStop).toHaveBeenCalledOnce()
    expect(harness.subscribe).toHaveBeenCalledTimes(2)
    harness.callbackFor(threadA).onSnapshot(makeSnapshot(threadA, 2, "running"))
    syncWarmThreadSnapshotEvent({
      _tag: "thread-upserted",
      sequence: Sequence.make(5),
      thread: makeShell(threadA, "completed"),
    })
    const ended = terminalEnvelope(threadA, 5)
    harness.callbackFor(threadA).onEvent(ended)

    expect(onEvent).toHaveBeenCalledWith(ended)
    expect(harness.stopFor(threadA)).not.toHaveBeenCalled()
    release()
    expect(harness.stopFor(threadA)).toHaveBeenCalledOnce()
  })

  it("replays the cached snapshot and takes status from the fresh visible stream", () => {
    const harness = installSubscriber()
    const snapshot = makeSnapshot(threadA, 2, "running")
    const status = { _tag: "Connected" } as const

    syncWarmThreadSnapshotEvent({
      _tag: "thread-upserted",
      sequence: Sequence.make(2),
      thread: makeShell(threadA, "running"),
    })
    harness.callbackFor(threadA).onSnapshot(snapshot)
    harness.callbackFor(threadA).onStatus(status)

    const onSnapshot = vi.fn()
    const onStatus = vi.fn()
    const release = retainThreadSnapshotSubscription(threadA, {
      onSnapshot,
      onEvent: vi.fn(),
      onStatus,
    })

    expect(harness.subscribe).toHaveBeenCalledTimes(2)
    expect(onSnapshot).toHaveBeenCalledWith(snapshot)
    expect(onStatus).not.toHaveBeenCalled()
    harness.callbackFor(threadA).onStatus(status)
    expect(onStatus).toHaveBeenCalledWith(status)
    release()
  })

  it("tracks concurrent Threads independently when one completes first", () => {
    const harness = installSubscriber()

    for (const threadId of [threadA, threadB]) {
      syncWarmThreadSnapshotEvent({
        _tag: "thread-upserted",
        sequence: Sequence.make(2),
        thread: makeShell(threadId, "running"),
      })
      harness.callbackFor(threadId).onSnapshot(makeSnapshot(threadId, 2, "running"))
    }

    syncWarmThreadSnapshotEvent({
      _tag: "thread-upserted",
      sequence: Sequence.make(5),
      thread: makeShell(threadB, "completed"),
    })
    harness.callbackFor(threadB).onEvent(terminalEnvelope(threadB, 5))

    expect(getThreadSnapshot(threadA)?.thread.latestTurn?.state).toBe("running")
    expect(getThreadSnapshot(threadB)?.thread.latestTurn?.state).toBe("completed")
    expect(harness.stopFor(threadA)).not.toHaveBeenCalled()
    expect(harness.stopFor(threadB)).toHaveBeenCalledOnce()
  })

  it("warms a cold Thread when completion is the first observed transition", () => {
    const harness = installSubscriber()

    syncWarmThreadSnapshotEvent({
      _tag: "thread-upserted",
      sequence: Sequence.make(5),
      thread: makeShell(threadA, "completed"),
    })
    harness.callbackFor(threadA).onSnapshot(makeSnapshot(threadA, 5, "completed"))

    expect(getThreadSnapshot(threadA)?.snapshotSequence).toBe(5)
    expect(harness.stopFor(threadA)).toHaveBeenCalledOnce()
  })

  it("does not subscribe again when the cache already has the terminal Turn", () => {
    const harness = installSubscriber()
    replaceThreadSnapshot(makeSnapshot(threadA, 5, "completed"))

    syncWarmThreadSnapshotEvent({
      _tag: "thread-upserted",
      sequence: Sequence.make(8),
      thread: makeShell(threadA, "completed"),
    })

    expect(harness.subscribe).not.toHaveBeenCalled()
  })
})
