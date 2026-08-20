import { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import { TranscriptItem } from "@noyau/protocol/entities/transcript"
import {
  DomainEvent,
  EventEnvelope,
  type DomainEvent as DomainEventType,
} from "@noyau/protocol/events"
import { ApprovalRequestId, ProjectId, ThreadId, TurnId } from "@noyau/protocol/ids"
import { Schema } from "effect"
import { describe, expect, it } from "vite-plus/test"

import {
  applyThreadEnvelope,
  projectTranscriptItem,
  threadStatusNoticesVisible,
  transcriptRowId,
} from "../src/lib/thread-transcript"

const ids = {
  project: ProjectId.make("10000000-0000-4000-8000-000000000001"),
  thread: ThreadId.make("20000000-0000-4000-8000-000000000001"),
  turn: TurnId.make("40000000-0000-4000-8000-000000000001"),
  nextTurn: TurnId.make("40000000-0000-4000-8000-000000000002"),
  request: ApprovalRequestId.make("approval-1"),
}

const encodeEvent = Schema.encodeSync(DomainEvent)
const decodeTranscript = Schema.decodeSync(TranscriptItem)

const snapshot = Schema.decodeSync(ThreadSnapshot)({
  snapshotSequence: 8,
  thread: {
    id: ids.thread,
    projectId: ids.project,
    title: "Premier prompt",
    provider: "cursor",
    runtimeMode: "auto",
    status: "active",
    session: null,
    latestTurn: {
      turnId: ids.turn,
      state: "running",
      requestedAt: "2026-08-19T12:00:00.000Z",
      startedAt: "2026-08-19T12:00:00.100Z",
      completedAt: null,
    },
    createdAt: "2026-08-19T12:00:00.000Z",
    updatedAt: "2026-08-19T12:00:00.000Z",
  },
  session: {
    threadId: ids.thread,
    status: "running",
    lastError: null,
    activeTurnId: ids.turn,
    runtimeMode: "auto",
    resumeCursor: {
      schemaVersion: 1,
      sessionId: "cursor-session",
    },
    updatedAt: "2026-08-19T12:00:00.000Z",
  },
  turns: [
    {
      id: ids.turn,
      threadId: ids.thread,
      ordinal: 1,
      state: "running",
      requestedAt: "2026-08-19T12:00:00.000Z",
      startedAt: "2026-08-19T12:00:00.100Z",
      completedAt: null,
    },
  ],
  transcript: [
    {
      _tag: "transcript.user",
      threadId: ids.thread,
      turnId: ids.turn,
      text: "Ouvre le dossier",
    },
  ],
})

const envelopeFor = (event: DomainEventType, sequence = 9) =>
  Schema.decodeSync(EventEnvelope)({
    eventId: "60000000-0000-4000-8000-000000000001",
    projectId: ids.project,
    actorId: "human:hezaerd",
    correlationId: "80000000-0000-4000-8000-000000000001",
    causationId: "90000000-0000-4000-8000-000000000001",
    occurredAt: "2026-08-19T12:00:01.000Z",
    schemaVersion: 1,
    sequence,
    event: encodeEvent(event),
  })

describe("thread transcript projection", () => {
  it("concatenates consecutive assistant chunks of the same Turn", () => {
    const first = decodeTranscript({
      _tag: "transcript.assistant",
      threadId: ids.thread,
      turnId: ids.turn,
      text: "Bon",
    })
    const second = decodeTranscript({
      _tag: "transcript.assistant",
      threadId: ids.thread,
      turnId: ids.turn,
      text: "jour",
    })

    const afterFirst = projectTranscriptItem(snapshot.transcript, first)
    const afterSecond = projectTranscriptItem(afterFirst, second)
    const assistant = afterSecond.at(-1)

    expect(assistant?._tag).toBe("transcript.assistant")
    if (assistant?._tag === "transcript.assistant") {
      expect(assistant.text).toBe("Bonjour")
    }
  })

  it("keeps a stable row id while assistant text grows", () => {
    const first = decodeTranscript({
      _tag: "transcript.assistant",
      threadId: ids.thread,
      turnId: ids.turn,
      text: "Bo",
    })
    const grown = decodeTranscript({
      _tag: "transcript.assistant",
      threadId: ids.thread,
      turnId: ids.turn,
      text: "Bonjour **monde**",
    })

    expect(transcriptRowId(first, 1)).toBe(transcriptRowId(grown, 1))
    expect(transcriptRowId(first, 1)).not.toBe(transcriptRowId(grown, 2))
  })

  it("applies transcript-appended locally without a snapshot reload", () => {
    const next = applyThreadEnvelope(
      snapshot,
      envelopeFor({
        _tag: "thread.transcript-appended",
        item: {
          _tag: "transcript.assistant",
          threadId: ids.thread,
          turnId: ids.turn,
          text: "# Titre\n\n```ts\nconst x",
        },
      }),
    )

    expect(next?.transcript.at(-1)).toMatchObject({
      _tag: "transcript.assistant",
      text: "# Titre\n\n```ts\nconst x",
    })
  })

  it("appends the user row on turn.started and ignores a duplicate", () => {
    const started = envelopeFor({
      _tag: "thread.turn.started",
      threadId: ids.thread,
      turnId: ids.nextTurn,
      text: "Continue",
    })
    const once = applyThreadEnvelope(snapshot, started)
    const twice = once === undefined ? undefined : applyThreadEnvelope(once, started)

    expect(once?.transcript.at(-1)).toMatchObject({
      _tag: "transcript.user",
      turnId: ids.nextTurn,
      text: "Continue",
    })
    expect(once?.thread.latestTurn?.state).toBe("running")
    expect(twice?.turns).toHaveLength(2)
  })

  it("resolves a pending permission locally", () => {
    const withPermission: typeof snapshot = {
      ...snapshot,
      transcript: [
        ...snapshot.transcript,
        decodeTranscript({
          _tag: "transcript.permission",
          threadId: ids.thread,
          turnId: ids.turn,
          requestId: ids.request,
          status: "pending",
        }),
      ],
    }
    const next = applyThreadEnvelope(
      withPermission,
      envelopeFor({
        _tag: "approval.responded",
        threadId: ids.thread,
        requestId: ids.request,
        decision: "accept",
      }),
    )
    const permission = next?.transcript.at(-1)

    expect(permission?._tag).toBe("transcript.permission")
    if (permission?._tag === "transcript.permission") {
      expect(permission.status).toBe("resolved")
    }
  })

  it("leaves structural events to a snapshot refresh", () => {
    expect(
      applyThreadEnvelope(
        snapshot,
        envelopeFor({
          _tag: "thread.runtime-mode-set",
          threadId: ids.thread,
          runtimeMode: "full-access",
        }),
      ),
    ).toBeUndefined()
  })

  it("shows Session lastError and hides the interrupted notice otherwise", () => {
    expect(
      threadStatusNoticesVisible({ status: "error", lastError: "ACP indisponible" }, null),
    ).toBe(true)
    expect(threadStatusNoticesVisible({ status: "ready", lastError: null }, null)).toBe(false)
  })
})
