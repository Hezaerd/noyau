// @vitest-environment happy-dom

import { ThreadSnapshot } from "@noyau/contracts/entities/thread-snapshot"
import {
  DomainEvent,
  EventEnvelope,
  type DomainEvent as DomainEventType,
} from "@noyau/contracts/events"
import { ProjectId, ThreadId, TurnId } from "@noyau/contracts/ids"
import { act, cleanup, renderHook } from "@testing-library/react"
import { Schema } from "effect"
import { afterEach, describe, expect, it } from "vitest"

import { useThreadSnapshot } from "../src/hooks/use-thread-snapshot"
import { resetAppAtomRegistryForTests } from "../src/state/atom-registry"
import { reduceThreadSnapshotEnvelope, replaceThreadSnapshot } from "../src/state/thread-snapshot"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const turnId = TurnId.make("30000000-0000-4000-8000-000000000001")

const encodeEvent = Schema.encodeSync(DomainEvent)

const makeSnapshot = (sequence: number, title = "Thread"): ThreadSnapshot =>
  Schema.decodeSync(ThreadSnapshot)({
    snapshotSequence: sequence,
    thread: {
      id: threadId,
      projectId,
      title,
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

const runningSnapshot = Schema.decodeSync(ThreadSnapshot)({
  snapshotSequence: 1,
  thread: {
    id: threadId,
    projectId,
    title: "Live",
    provider: "cursor",
    runtimeMode: "full-access",
    modelSelection: null,
    status: "active",
    session: null,
    latestTurn: {
      turnId,
      state: "running",
      requestedAt: "2026-08-19T12:00:00.000Z",
      startedAt: "2026-08-19T12:00:00.000Z",
      completedAt: null,
    },
    createdAt: "2026-08-19T12:00:00.000Z",
    listedAt: "2026-08-19T12:00:00.000Z",
    updatedAt: "2026-08-19T12:00:00.000Z",
  },
  session: {
    threadId,
    status: "running",
    lastError: null,
    activeTurnId: turnId,
    runtimeMode: "full-access",
    resumeCursor: {
      schemaVersion: 1,
      sessionId: "cursor-session",
    },
    updatedAt: "2026-08-19T12:00:00.000Z",
  },
  turns: [
    {
      id: turnId,
      threadId,
      ordinal: 1,
      state: "running",
      requestedAt: "2026-08-19T12:00:00.000Z",
      startedAt: "2026-08-19T12:00:00.000Z",
      completedAt: null,
    },
  ],
  transcript: [{ _tag: "transcript.user", threadId, turnId, text: "Go" }],
})

const envelopeFor = (event: DomainEventType, sequence: number) =>
  Schema.decodeSync(EventEnvelope)({
    eventId: "60000000-0000-4000-8000-000000000001",
    projectId,
    actorId: "human:hezaerd",
    correlationId: "80000000-0000-4000-8000-000000000001",
    causationId: "90000000-0000-4000-8000-000000000001",
    occurredAt: "2026-08-19T12:00:01.000Z",
    schemaVersion: 1,
    sequence,
    event: encodeEvent(event),
  })

afterEach(() => {
  cleanup()
  resetAppAtomRegistryForTests()
})

describe("thread snapshot subscription", () => {
  it("re-renders when the registry replaces the open Thread snapshot", () => {
    const { result } = renderHook(() => useThreadSnapshot(threadId))
    expect(result.current).toBeUndefined()

    act(() => {
      replaceThreadSnapshot(makeSnapshot(1, "Opened"))
    })
    expect(result.current?.thread.title).toBe("Opened")

    act(() => {
      replaceThreadSnapshot(makeSnapshot(2, "Updated"))
    })
    expect(result.current?.thread.title).toBe("Updated")
    expect(result.current?.snapshotSequence).toBe(2)
  })

  it("re-renders when a live envelope settles the open Turn", () => {
    act(() => {
      replaceThreadSnapshot(runningSnapshot)
    })

    const { result } = renderHook(() => useThreadSnapshot(threadId))
    expect(result.current?.thread.latestTurn?.state).toBe("running")

    act(() => {
      reduceThreadSnapshotEnvelope(
        threadId,
        envelopeFor(
          {
            _tag: "thread.turn.ended",
            threadId,
            turnId,
            state: "completed",
          },
          2,
        ),
      )
    })

    expect(result.current?.thread.latestTurn?.state).toBe("completed")
  })
})
