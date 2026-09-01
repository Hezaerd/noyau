import { ThreadSnapshot } from "@noyau/contracts/entities/thread-snapshot"
import {
  DomainEvent,
  EventEnvelope,
  type DomainEvent as DomainEventType,
} from "@noyau/contracts/events"
import { ProjectId, Sequence, ThreadId, TurnId } from "@noyau/contracts/ids"
import { ThreadShell } from "@noyau/contracts/shell"
import { Schema } from "effect"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { resetAppAtomRegistryForTests } from "../src/state/atom-registry"
import { getThreadSnapshot, replaceThreadSnapshot } from "../src/state/thread-snapshot"
import {
  resetThreadSnapshotSubscriptionsForTests,
  retainThreadSnapshotSubscription,
  setThreadSnapshotSubscriberForTests,
  syncWarmThreadSnapshotEvent,
  syncWarmThreadSnapshots,
  type ThreadSnapshotSubscriptionCallbacks,
} from "../src/state/thread-snapshot-subscriptions"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const turnId = TurnId.make("30000000-0000-4000-8000-000000000001")

const latestTurn = (state: "running" | "completed") => ({
  turnId,
  state,
  requestedAt: "2026-08-19T12:00:00.000Z",
  startedAt: "2026-08-19T12:00:00.000Z",
  completedAt: state === "running" ? null : "2026-08-19T12:01:00.000Z",
})

const makeSnapshot = (sequence: number, state: "running" | "completed"): ThreadSnapshot =>
  Schema.decodeSync(ThreadSnapshot)({
    snapshotSequence: sequence,
    thread: {
      id: threadId,
      projectId,
      title: "Background Thread",
      provider: "cursor",
      runtimeMode: "auto",
      modelSelection: null,
      status: "active",
      session: null,
      latestTurn: latestTurn(state),
      createdAt: "2026-08-19T12:00:00.000Z",
      listedAt: "2026-08-19T12:00:00.000Z",
      updatedAt: "2026-08-19T12:01:00.000Z",
    },
    session: null,
    turns: [
      {
        id: turnId,
        threadId,
        ordinal: 1,
        state,
        requestedAt: "2026-08-19T12:00:00.000Z",
        startedAt: "2026-08-19T12:00:00.000Z",
        completedAt: state === "running" ? null : "2026-08-19T12:01:00.000Z",
      },
    ],
    transcript: [],
  })

const makeShell = (state: "running" | "completed"): ThreadShell =>
  Schema.decodeSync(ThreadShell)({
    id: threadId,
    projectId,
    title: "Background Thread",
    provider: "cursor",
    runtimeMode: "auto",
    modelSelection: null,
    status: "active",
    sessionStatus: "ready",
    lastError: null,
    latestTurn: latestTurn(state),
    createdAt: "2026-08-19T12:00:00.000Z",
    listedAt: "2026-08-19T12:00:00.000Z",
    updatedAt: "2026-08-19T12:01:00.000Z",
  })

const encodeEvent = Schema.encodeSync(DomainEvent)
const envelopeFor = (event: DomainEventType, sequence: number): EventEnvelope =>
  Schema.decodeSync(EventEnvelope)({
    eventId: "60000000-0000-4000-8000-000000000001",
    projectId,
    actorId: "human:hezaerd",
    correlationId: "80000000-0000-4000-8000-000000000001",
    causationId: "90000000-0000-4000-8000-000000000001",
    occurredAt: "2026-08-19T12:01:00.000Z",
    schemaVersion: 1,
    sequence,
    event: encodeEvent(event),
  })

const terminalEnvelope = () =>
  envelopeFor(
    {
      _tag: "thread.turn.ended",
      threadId,
      turnId,
      state: "completed",
    },
    5,
  )

const installSubscriber = () => {
  let callbacks: ThreadSnapshotSubscriptionCallbacks | undefined
  const stop = vi.fn()
  const subscribe = vi.fn(
    (
      _threadId: ThreadId,
      _afterSequence: Sequence | undefined,
      next: ThreadSnapshotSubscriptionCallbacks,
    ) => {
      callbacks = next
      return stop
    },
  )
  setThreadSnapshotSubscriberForTests(subscribe)
  return {
    callbacks: () => {
      if (callbacks === undefined) {
        throw new Error("expected a Thread subscription")
      }
      return callbacks
    },
    stop,
    subscribe,
  }
}

afterEach(() => {
  resetThreadSnapshotSubscriptionsForTests()
  resetAppAtomRegistryForTests()
})

describe("warm Thread snapshot subscriptions", () => {
  it("keeps a running background Thread warm until its terminal event is reduced", () => {
    const harness = installSubscriber()

    syncWarmThreadSnapshotEvent({
      _tag: "thread-upserted",
      sequence: Sequence.make(2),
      thread: makeShell("running"),
    })
    expect(harness.subscribe).toHaveBeenCalledWith(threadId, undefined, expect.any(Object))

    harness.callbacks().onSnapshot(makeSnapshot(2, "running"))
    harness.callbacks().onEvent(
      envelopeFor(
        {
          _tag: "thread.transcript-appended",
          item: {
            _tag: "transcript.assistant",
            threadId,
            turnId,
            text: "Still working",
          },
        },
        4,
      ),
    )
    expect(getThreadSnapshot(threadId)?.transcript.at(-1)).toMatchObject({
      _tag: "transcript.assistant",
      text: "Still working",
    })

    syncWarmThreadSnapshotEvent({
      _tag: "thread-upserted",
      sequence: Sequence.make(5),
      thread: makeShell("completed"),
    })
    expect(harness.stop).not.toHaveBeenCalled()

    harness.callbacks().onEvent(terminalEnvelope())
    expect(getThreadSnapshot(threadId)?.thread.latestTurn?.state).toBe("completed")
    expect(harness.stop).toHaveBeenCalledOnce()
  })

  it("shares the background writer with the mounted Thread page", () => {
    const harness = installSubscriber()
    const onEvent = vi.fn()

    syncWarmThreadSnapshots([makeShell("running")])
    const release = retainThreadSnapshotSubscription(threadId, {
      onSnapshot: vi.fn(),
      onEvent,
      onStatus: vi.fn(),
    })
    expect(harness.subscribe).toHaveBeenCalledOnce()

    harness.callbacks().onSnapshot(makeSnapshot(2, "running"))
    syncWarmThreadSnapshotEvent({
      _tag: "thread-upserted",
      sequence: Sequence.make(5),
      thread: makeShell("completed"),
    })
    const ended = terminalEnvelope()
    harness.callbacks().onEvent(ended)

    expect(onEvent).toHaveBeenCalledWith(ended)
    expect(harness.stop).not.toHaveBeenCalled()
    release()
    expect(harness.stop).toHaveBeenCalledOnce()
  })

  it("warms a cold Thread when completion is the first observed transition", () => {
    const harness = installSubscriber()

    syncWarmThreadSnapshotEvent({
      _tag: "thread-upserted",
      sequence: Sequence.make(5),
      thread: makeShell("completed"),
    })
    harness.callbacks().onSnapshot(makeSnapshot(5, "completed"))

    expect(getThreadSnapshot(threadId)?.snapshotSequence).toBe(5)
    expect(harness.stop).toHaveBeenCalledOnce()
  })

  it("does not subscribe again when the warm body already has the terminal Turn", () => {
    const harness = installSubscriber()
    replaceThreadSnapshot(makeSnapshot(5, "completed"))

    syncWarmThreadSnapshotEvent({
      _tag: "thread-upserted",
      sequence: Sequence.make(8),
      thread: makeShell("completed"),
    })

    expect(harness.subscribe).not.toHaveBeenCalled()
  })
})
