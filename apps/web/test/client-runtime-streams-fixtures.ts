import { BoardSnapshot } from "@noyau/protocol/board"
import { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import { EventEnvelope } from "@noyau/protocol/events"
import type { Sequence } from "@noyau/protocol/ids"
import type { ThreadStreamItem } from "@noyau/protocol/rpc"
import { ShellLiveEvent, ShellSnapshot } from "@noyau/protocol/shell"
import { ThreadAssistantLive } from "@noyau/protocol/thread/live"
import { Schema } from "effect"

export const STREAM_IDS = {
  environment: "30000000-0000-4000-8000-000000000001",
  project: "10000000-0000-4000-8000-000000000001",
  thread: "20000000-0000-4000-8000-000000000001",
  turn: "40000000-0000-4000-8000-000000000001",
  command: "70000000-0000-4000-8000-000000000001",
  correlation: "80000000-0000-4000-8000-000000000001",
} as const

const AT = "2026-08-25T12:00:00.000Z"

const sequenceEventId = (sequence: number): string =>
  `90000000-0000-4000-8000-${sequence.toString().padStart(12, "0")}`

export type StreamKind = "shell" | "project" | "thread"

type SequencedSnapshot = { readonly snapshotSequence: Sequence }
type SequencedEvent = { readonly sequence: Sequence }

export type SharedSequencedFrame<
  Snapshot extends SequencedSnapshot = SequencedSnapshot,
  Event extends SequencedEvent = SequencedEvent,
> =
  | { readonly kind: "snapshot"; readonly snapshot: Snapshot }
  | { readonly kind: "event"; readonly event: Event }
  | { readonly kind: "synchronized" }

export interface StreamHarness<
  Snapshot extends SequencedSnapshot = SequencedSnapshot,
  Event extends SequencedEvent = SequencedEvent,
> {
  readonly name: StreamKind
  readonly snapshotFrame: (sequence: number) => SharedSequencedFrame<Snapshot, Event>
  readonly eventFrame: (sequence: number) => SharedSequencedFrame<Snapshot, Event>
  readonly synchronizedFrame: SharedSequencedFrame<Snapshot, Event>
}

const encodedShellSnapshot = (sequence: number): (typeof ShellSnapshot)["Encoded"] => ({
  snapshotSequence: sequence,
  environment: {
    id: STREAM_IDS.environment,
    cursor: {
      installed: false,
      handshakeOk: false,
      version: null,
      plan: null,
      binaryPath: null,
      models: [],
    },
    createdAt: AT,
  },
  projects: [],
  threads: [],
})

const encodedBoardSnapshot = (sequence: number): (typeof BoardSnapshot)["Encoded"] => ({
  snapshotSequence: sequence,
  projectId: STREAM_IDS.project,
  project: {
    id: STREAM_IDS.project,
    name: "Noyau",
    workspaceRoot: "/tmp/noyau",
    available: true,
    createdAt: AT,
    updatedAt: AT,
  },
  columns: [],
  tickets: [],
  ticketDependencies: [],
  ticketThreads: [],
  ticketActivity: [],
})

const encodedThreadSnapshot = (sequence: number): (typeof ThreadSnapshot)["Encoded"] => ({
  snapshotSequence: sequence,
  thread: {
    id: STREAM_IDS.thread,
    projectId: STREAM_IDS.project,
    title: "Thread",
    provider: "cursor",
    runtimeMode: "auto",
    modelSelection: null,
    status: "active",
    session: null,
    latestTurn: null,
    createdAt: AT,
    updatedAt: AT,
  },
  session: null,
  turns: [],
  transcript: [],
})

const encodedJournalEvent = (sequence: number): (typeof EventEnvelope)["Encoded"] => ({
  eventId: sequenceEventId(sequence),
  sequence,
  projectId: STREAM_IDS.project,
  actorId: "system",
  correlationId: STREAM_IDS.correlation,
  causationId: STREAM_IDS.command,
  occurredAt: AT,
  schemaVersion: 1,
  event: {
    _tag: "thread.archived",
    threadId: STREAM_IDS.thread,
  },
})

const makeJournalEvent = (sequence: number): EventEnvelope =>
  Schema.decodeSync(EventEnvelope)(encodedJournalEvent(sequence))

export const makeShellSnapshotFixture = (sequence: number): ShellSnapshot =>
  Schema.decodeSync(ShellSnapshot)(encodedShellSnapshot(sequence))

export const makeShellStreamHarness = (): StreamHarness<ShellSnapshot, ShellLiveEvent> => ({
  name: "shell",
  snapshotFrame: (sequence) => ({
    kind: "snapshot",
    snapshot: Schema.decodeSync(ShellSnapshot)(encodedShellSnapshot(sequence)),
  }),
  eventFrame: (sequence) => ({
    kind: "event",
    event: Schema.decodeSync(ShellLiveEvent)({
      _tag: "thread-removed",
      sequence,
      threadId: STREAM_IDS.thread,
    }),
  }),
  synchronizedFrame: { kind: "synchronized" },
})

export const makeProjectStreamHarness = (): StreamHarness<BoardSnapshot, EventEnvelope> => ({
  name: "project",
  snapshotFrame: (sequence) => ({
    kind: "snapshot",
    snapshot: Schema.decodeSync(BoardSnapshot)(encodedBoardSnapshot(sequence)),
  }),
  eventFrame: (sequence) => ({
    kind: "event",
    event: makeJournalEvent(sequence),
  }),
  synchronizedFrame: { kind: "synchronized" },
})

export const makeThreadStreamHarness = (): StreamHarness<ThreadSnapshot, EventEnvelope> => ({
  name: "thread",
  snapshotFrame: (sequence) => ({
    kind: "snapshot",
    snapshot: Schema.decodeSync(ThreadSnapshot)(encodedThreadSnapshot(sequence)),
  }),
  eventFrame: (sequence) => ({
    kind: "event",
    event: makeJournalEvent(sequence),
  }),
  synchronizedFrame: { kind: "synchronized" },
})

export const STREAM_HARNESSES: ReadonlyArray<StreamHarness> = [
  makeShellStreamHarness(),
  makeProjectStreamHarness(),
  makeThreadStreamHarness(),
]

export const makeThreadLiveFrame = (): Extract<ThreadStreamItem, { readonly kind: "live" }> => ({
  kind: "live",
  live: Schema.decodeSync(ThreadAssistantLive)({
    threadId: STREAM_IDS.thread,
    turnId: STREAM_IDS.turn,
    text: "hint",
  }),
})
