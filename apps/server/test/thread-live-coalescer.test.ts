import { it } from "@effect/vitest"
import type { DomainEvent } from "@noyau/contracts/events"
import { ThreadId, ToolCallId, TurnId } from "@noyau/contracts/ids"
import { ThreadTranscriptAppended, ThreadTurnEnded } from "@noyau/contracts/thread/events"
import type { PersistedEvent } from "@noyau/server/persistence/command-worker"
import {
  coalescePersistedForThread,
  makeThreadLiveEventCoalescer,
} from "@noyau/server/thread-live-coalescer"
import { DateTime, Deferred, Effect, Fiber, Stream } from "effect"
import { TestClock } from "effect/testing"
import { describe, expect } from "vite-plus/test"

const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const turnId = TurnId.make("30000000-0000-4000-8000-000000000001")

const tool = (
  sequence: number,
  toolCallId: string,
  status: "in_progress" | "completed" = "in_progress",
) => ({
  sequence,
  event: ThreadTranscriptAppended.make({
    item: {
      _tag: "transcript.tool",
      threadId,
      turnId,
      toolCallId: ToolCallId.make(toolCallId),
      name: "Read",
      status,
    },
  }),
})

const persisted = (value: ReturnType<typeof tool>): PersistedEvent<DomainEvent> => ({
  eventId: `event-${String(value.sequence)}`,
  sequence: value.sequence,
  projectId: "10000000-0000-4000-8000-000000000001",
  actorId: "human:test",
  correlationId: "30000000-0000-4000-8000-000000000001",
  causationId: "30000000-0000-4000-8000-000000000002",
  occurredAt: DateTime.makeUnsafe("2026-09-01T12:00:00.000Z"),
  schemaVersion: 1,
  aggregate: { kind: "thread", id: threadId },
  aggregateVersion: value.sequence,
  event: value.event,
})

describe("coalescePersistedForThread", () => {
  it("keeps the latest update for each parallel tool in sequence order", () => {
    const survivors = coalescePersistedForThread([
      tool(1, "tool-a"),
      tool(2, "tool-b"),
      tool(3, "tool-a"),
      tool(4, "tool-b"),
    ])

    expect(survivors.map((item) => item.sequence)).toEqual([3, 4])
  })

  it("does not coalesce reused tool ids across turns", () => {
    const nextTurn = TurnId.make("30000000-0000-4000-8000-000000000002")
    const first = tool(1, "tool-a")
    const second = tool(2, "tool-a")
    const withNextTurn = {
      ...second,
      event: ThreadTranscriptAppended.make({ item: { ...second.event.item, turnId: nextTurn } }),
    }

    expect(coalescePersistedForThread([first, withNextTurn]).map((item) => item.sequence)).toEqual([
      1, 2,
    ])
  })

  it("flushes updates before completion and other Thread events", () => {
    const completion = tool(3, "tool-a", "completed")
    const ended = {
      sequence: 5,
      event: ThreadTurnEnded.make({ threadId, turnId, state: "completed" }),
    }

    expect(
      coalescePersistedForThread([
        tool(1, "tool-a"),
        tool(2, "tool-a"),
        completion,
        tool(4, "tool-a"),
        ended,
      ]).map((item) => item.sequence),
    ).toEqual([2, 3, 4, 5])
  })

  it.effect("flushes pending updates before the synchronization marker", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const coalescer = yield* makeThreadLiveEventCoalescer({
          coalesceWindow: "1 second",
        })
        yield* coalescer.offer({ kind: "event", event: persisted(tool(1, "tool-a")) })
        yield* coalescer.offer({ kind: "event", event: persisted(tool(2, "tool-a")) })
        yield* coalescer.offer({ kind: "synchronized" })
        const frames = yield* coalescer.stream.pipe(Stream.take(2), Stream.runCollect)

        expect(
          Array.from(frames).map((frame) =>
            frame.kind === "event" ? frame.event.sequence : frame.kind,
          ),
        ).toEqual([2, "synchronized"])
      }),
    ),
  )

  it.effect("flushes a quiet update run after the bounded window", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const windowSleepStarted = yield* Deferred.make<void>()
        const coalescer = yield* makeThreadLiveEventCoalescer({
          beforeWindowSleep: Deferred.succeed(windowSleepStarted, undefined),
        })
        const frames = yield* coalescer.stream.pipe(
          Stream.take(1),
          Stream.runCollect,
          Effect.forkChild,
        )
        yield* coalescer.offer({ kind: "event", event: persisted(tool(1, "tool-a")) })
        yield* coalescer.offer({ kind: "event", event: persisted(tool(2, "tool-a")) })
        yield* Deferred.await(windowSleepStarted)
        yield* TestClock.adjust("50 millis")

        expect(
          Array.from(yield* Fiber.join(frames)).map((frame) =>
            frame.kind === "event" ? frame.event.sequence : frame.kind,
          ),
        ).toEqual([2])
      }),
    ),
  )
})
