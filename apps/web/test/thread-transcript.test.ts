import { ProviderInstanceId } from "@noyau/contracts/entities/environment"
import { ThreadSnapshot } from "@noyau/contracts/entities/thread-snapshot"
import { TranscriptItem } from "@noyau/contracts/entities/transcript"
import { checkpointRefForTurn } from "@noyau/contracts/entities/turn"
import {
  DomainEvent,
  EventEnvelope,
  type DomainEvent as DomainEventType,
} from "@noyau/contracts/events"
import { ApprovalRequestId, ProjectId, ThreadId, TurnId } from "@noyau/contracts/ids"
import { DateTime, Schema } from "effect"
import { describe, expect, it } from "vite-plus/test"

import {
  applyThreadEnvelope,
  flushedAssistantPrefix,
  groupTranscriptRows,
  lastAssistantIndexByTurnId,
  presentTranscriptTool,
  projectTranscriptItem,
  summarizeTranscriptToolGroup,
  threadStatusNoticesVisible,
  transcriptRowId,
  transcriptWithLiveAssistantPlaceholder,
  transcriptToolCaption,
  transcriptToolDisplay,
  transcriptToolGroupLabel,
  transcriptToolObject,
  transcriptToolVerb,
  turnDiffForTranscriptItem,
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
    modelSelection: null,
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
    listedAt: "2026-08-19T12:00:00.000Z",
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

  it("porte la présentation de Turn dans la row utilisateur", () => {
    const started = envelopeFor({
      _tag: "thread.turn.started",
      threadId: ids.thread,
      turnId: ids.nextTurn,
      text: "PR #12 conflicts with main.",
      presentation: "fix-merge-conflicts",
      titleSeed: "Fix merge conflicts",
    })
    const next = applyThreadEnvelope(snapshot, started)
    expect(next?.transcript.at(-1)).toMatchObject({
      _tag: "transcript.user",
      turnId: ids.nextTurn,
      presentation: "fix-merge-conflicts",
    })
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

  it("applies context-usage-set locally without a snapshot reload", () => {
    const next = applyThreadEnvelope(
      snapshot,
      envelopeFor({
        _tag: "thread.context-usage-set",
        threadId: ids.thread,
        contextUsage: { used: 12400, window: 200000 },
      }),
    )

    expect(next?.thread.contextUsage).toEqual({ used: 12400, window: 200000 })
  })

  it("applies a generated title locally", () => {
    const next = applyThreadEnvelope(
      snapshot,
      envelopeFor({
        _tag: "thread.title-seeded",
        threadId: ids.thread,
        title: "Fix session resume",
      }),
    )

    expect(next?.thread.title).toBe("Fix session resume")
  })

  it("applies session-set and runtime-mode-set locally without a snapshot reload", () => {
    const runningSession = snapshot.session
    if (runningSession === null) {
      throw new Error("fixture session")
    }
    const afterMode = applyThreadEnvelope(
      snapshot,
      envelopeFor({
        _tag: "thread.runtime-mode-set",
        threadId: ids.thread,
        runtimeMode: "full-access",
      }),
    )
    const afterReady =
      afterMode === undefined
        ? undefined
        : applyThreadEnvelope(
            afterMode,
            envelopeFor({
              _tag: "thread.session-set",
              threadId: ids.thread,
              session: {
                ...runningSession,
                status: "ready",
                activeTurnId: null,
              },
            }),
          )

    expect(afterMode?.thread.runtimeMode).toBe("full-access")
    expect(afterMode?.session?.runtimeMode).toBe("full-access")
    expect(afterReady?.session?.status).toBe("ready")
    expect(afterReady?.thread.latestTurn?.state).toBe("completed")
    expect(afterReady?.turns[0]?.state).toBe("completed")
  })

  it("applies the remembered model setup locally without a snapshot reload", () => {
    const next = applyThreadEnvelope(
      snapshot,
      envelopeFor({
        _tag: "thread.model-selection-set",
        threadId: ids.thread,
        modelSelection: {
          modelId: "composer-2.5",
          reasoningEffort: "high",
          serviceTier: "fast",
        },
      }),
    )

    expect(next?.thread.modelSelection).toEqual({
      modelId: "composer-2.5",
      reasoningEffort: "high",
      serviceTier: "fast",
    })
  })

  it("applies a provider handoff and marks its first user message", () => {
    const withUsage = applyThreadEnvelope(
      snapshot,
      envelopeFor({
        _tag: "thread.context-usage-set",
        threadId: ids.thread,
        contextUsage: { used: 12400, window: 200000 },
      }),
    )
    const handedOff =
      withUsage === undefined
        ? undefined
        : applyThreadEnvelope(
            withUsage,
            envelopeFor(
              {
                _tag: "thread.provider-handed-off",
                threadId: ids.thread,
                previousProvider: ProviderInstanceId.make("cursor"),
                provider: ProviderInstanceId.make("claude"),
                previousModelSelection: null,
                modelSelection: { modelId: "claude-sonnet-4-5" },
              },
              10,
            ),
          )
    const started =
      handedOff === undefined
        ? undefined
        : applyThreadEnvelope(
            handedOff,
            envelopeFor(
              {
                _tag: "thread.turn.started",
                threadId: ids.thread,
                turnId: ids.nextTurn,
                text: "Review the change",
                providerHandoff: {
                  previousProvider: ProviderInstanceId.make("cursor"),
                  provider: ProviderInstanceId.make("claude"),
                  previousModelSelection: null,
                  modelSelection: { modelId: "claude-sonnet-4-5" },
                },
              },
              11,
            ),
          )

    expect(handedOff?.thread.provider).toBe("claude")
    expect(handedOff?.thread.modelSelection).toEqual({ modelId: "claude-sonnet-4-5" })
    expect(handedOff?.session).toBeNull()
    expect(handedOff?.thread.contextUsage).toBeUndefined()
    expect(started?.transcript.at(-1)).toMatchObject({
      _tag: "transcript.user",
      providerHandoff: {
        previousProvider: "cursor",
        provider: "claude",
        previousModelSelection: null,
        modelSelection: { modelId: "claude-sonnet-4-5" },
      },
    })
  })

  it("keeps concatenating assistant deltas after a running session-set", () => {
    const runningSession = snapshot.session
    if (runningSession === null) {
      throw new Error("fixture session")
    }
    const afterSession = applyThreadEnvelope(
      snapshot,
      envelopeFor({
        _tag: "thread.session-set",
        threadId: ids.thread,
        session: runningSession,
      }),
    )
    const afterDelta =
      afterSession === undefined
        ? undefined
        : applyThreadEnvelope(
            afterSession,
            envelopeFor({
              _tag: "thread.transcript-appended",
              item: {
                _tag: "transcript.assistant",
                threadId: ids.thread,
                turnId: ids.turn,
                text: "Bonjour",
              },
            }),
          )

    expect(afterSession?.session?.status).toBe("running")
    expect(afterDelta?.transcript.at(-1)).toMatchObject({
      _tag: "transcript.assistant",
      text: "Bonjour",
    })
  })

  it("ignores assistant deltas once the Session has settled the Turn", () => {
    const runningSession = snapshot.session
    if (runningSession === null) {
      throw new Error("fixture session")
    }
    const settled = applyThreadEnvelope(
      snapshot,
      envelopeFor({
        _tag: "thread.session-set",
        threadId: ids.thread,
        session: {
          ...runningSession,
          status: "ready",
          activeTurnId: null,
        },
      }),
    )
    const afterDelta =
      settled === undefined
        ? undefined
        : applyThreadEnvelope(
            settled,
            envelopeFor({
              _tag: "thread.transcript-appended",
              item: {
                _tag: "transcript.assistant",
                threadId: ids.thread,
                turnId: ids.turn,
                text: "trop tard",
              },
            }),
          )

    expect(afterDelta?.transcript.at(-1)?._tag).toBe("transcript.user")
  })

  it("settles the running Turn from thread.turn.ended without waiting for session-set", () => {
    const next = applyThreadEnvelope(
      snapshot,
      envelopeFor({
        _tag: "thread.turn.ended",
        threadId: ids.thread,
        turnId: ids.turn,
        state: "completed",
      }),
    )

    expect(next?.turns[0]?.state).toBe("completed")
    expect(next?.thread.latestTurn?.state).toBe("completed")
    expect(next?.session?.activeTurnId).toBeNull()
  })

  it("attache le TurnDiff au Turn et le joint à la last assistant row", () => {
    const withAssistant: typeof snapshot = {
      ...snapshot,
      transcript: [
        ...snapshot.transcript,
        decodeTranscript({
          _tag: "transcript.assistant",
          threadId: ids.thread,
          turnId: ids.turn,
          text: "Premier",
        }),
        decodeTranscript({
          _tag: "transcript.assistant",
          threadId: ids.thread,
          turnId: ids.turn,
          text: " chunk",
        }),
      ],
    }
    const next = applyThreadEnvelope(
      withAssistant,
      envelopeFor({
        _tag: "thread.turn-diff-completed",
        threadId: ids.thread,
        turnId: ids.turn,
        checkpointRef: checkpointRefForTurn(ids.thread, 1),
        status: "ready",
        files: [{ path: "src/app.ts", kind: "modified", additions: 2, deletions: 1 }],
      }),
    )
    expect(next?.turns[0]?.turnDiff?.files).toEqual([
      { path: "src/app.ts", kind: "modified", additions: 2, deletions: 1 },
    ])
    const lastByTurn = lastAssistantIndexByTurnId(next?.transcript ?? [])
    expect(
      turnDiffForTranscriptItem(next!.transcript[1], 1, next!.turns, lastByTurn),
    ).toBeUndefined()
    expect(
      turnDiffForTranscriptItem(next!.transcript[2], 2, next!.turns, lastByTurn)?.files,
    ).toHaveLength(1)
  })

  it("ignores an envelope that belongs to another Thread", () => {
    const otherThread = ThreadId.make("20000000-0000-4000-8000-000000000099")
    const next = applyThreadEnvelope(
      snapshot,
      envelopeFor({
        _tag: "thread.turn.ended",
        threadId: otherThread,
        turnId: ids.turn,
        state: "completed",
      }),
    )

    expect(next).toBeUndefined()
  })

  it("rebases listedAt when the Thread is unsettled", () => {
    const next = applyThreadEnvelope(
      snapshot,
      envelopeFor({
        _tag: "thread.unsettled",
        threadId: ids.thread,
        reason: "user",
      }),
    )

    expect(next?.thread.settledOverride).toBe("active")
    expect(next && DateTime.formatIso(next.thread.createdAt)).toBe("2026-08-19T12:00:00.000Z")
    expect(next && DateTime.formatIso(next.thread.listedAt)).toBe("2026-08-19T12:00:01.000Z")
  })

  it("renders a compact tool caption without status or raw output", () => {
    const withPath = decodeTranscript({
      _tag: "transcript.tool",
      threadId: ids.thread,
      turnId: ids.turn,
      toolCallId: "tool-1",
      name: "Read file",
      status: "completed",
      action: "read",
      outputSummary: "src/pages/mentions-legales.astro",
    })
    const withoutPath = decodeTranscript({
      _tag: "transcript.tool",
      threadId: ids.thread,
      turnId: ids.turn,
      toolCallId: "tool-2",
      name: "Searched files",
      status: "completed",
    })

    expect(withPath._tag).toBe("transcript.tool")
    expect(withoutPath._tag).toBe("transcript.tool")
    if (withPath._tag === "transcript.tool") {
      expect(transcriptToolCaption(withPath)).toBe("Read file · src/pages/mentions-legales.astro")
      expect(transcriptToolVerb(withPath)).toBe("Read")
      expect(transcriptToolObject(withPath)).toBe("src/pages/mentions-legales.astro")
    }
    if (withoutPath._tag === "transcript.tool") {
      expect(transcriptToolCaption(withoutPath)).toBe("Searched files")
      expect(transcriptToolVerb(withoutPath)).toBe("Searched")
      expect(transcriptToolObject(withoutPath)).toBeUndefined()
    }
  })

  it("drops persisted JSON dumps and infers a write for Cursor tool fallbacks", () => {
    const dumped = decodeTranscript({
      _tag: "transcript.tool",
      threadId: ids.thread,
      turnId: ids.turn,
      toolCallId: "tool-dump",
      name: "Cursor tool",
      status: "completed",
      outputSummary: '{"content":"# VETOSUD — Prototype commercial\\nimport { Image }"}',
    })
    expect(dumped._tag).toBe("transcript.tool")
    if (dumped._tag === "transcript.tool") {
      expect(presentTranscriptTool(dumped)).toEqual({
        action: "file_change",
        name: "Wrote file",
      })
      expect(transcriptToolCaption(dumped)).toBe("Wrote file")
      expect(transcriptToolVerb(dumped)).toBe("Wrote")
      expect(transcriptToolObject(dumped)).toBeUndefined()
    }
  })

  it("infers a read from a Cursor tool fallback that only carries a path", () => {
    const fallback = decodeTranscript({
      _tag: "transcript.tool",
      threadId: ids.thread,
      turnId: ids.turn,
      toolCallId: "tool-path",
      name: "Cursor tool",
      status: "completed",
      outputSummary:
        "/Users/hezaerd/Library/Application Support/Electron/environment/worktrees/noyau/src/index.ts",
    })
    expect(fallback._tag).toBe("transcript.tool")
    if (fallback._tag === "transcript.tool") {
      expect(presentTranscriptTool(fallback)).toEqual({
        action: "read",
        name: "Read file",
        outputSummary:
          "/Users/hezaerd/Library/Application Support/Electron/environment/worktrees/noyau/src/index.ts",
      })
      expect(transcriptToolDisplay(fallback)).toBe(
        "/Users/hezaerd/Library/Application Support/Electron/environment/worktrees/noyau/src/index.ts",
      )
      expect(transcriptToolVerb(fallback)).toBe("Read")
    }
  })

  it("collapses consecutive tools of one Turn, including mixed actions", () => {
    const readOne = decodeTranscript({
      _tag: "transcript.tool",
      threadId: ids.thread,
      turnId: ids.turn,
      toolCallId: "tool-1",
      name: "Read file",
      status: "completed",
      action: "read",
      outputSummary: "src/pages/index.astro",
    })
    const assistant = decodeTranscript({
      _tag: "transcript.assistant",
      threadId: ids.thread,
      turnId: ids.turn,
      text: "ok",
    })
    const writes = ["a.astro", "b.astro", "c.astro"].map((path, index) =>
      decodeTranscript({
        _tag: "transcript.tool",
        threadId: ids.thread,
        turnId: ids.turn,
        toolCallId: `write-${String(index)}`,
        name: "Wrote file",
        status: "completed",
        action: "file_change",
        outputSummary: path,
      }),
    )
    const nextTurnWrite = decodeTranscript({
      _tag: "transcript.tool",
      threadId: ids.thread,
      turnId: ids.nextTurn,
      toolCallId: "write-next",
      name: "Wrote file",
      status: "completed",
      action: "file_change",
      outputSummary: "other.astro",
    })

    expect(readOne._tag).toBe("transcript.tool")
    expect(writes.every((item) => item._tag === "transcript.tool")).toBe(true)
    expect(nextTurnWrite._tag).toBe("transcript.tool")
    if (readOne._tag !== "transcript.tool" || nextTurnWrite._tag !== "transcript.tool") {
      return
    }
    const writeItems = writes.filter((item) => item._tag === "transcript.tool")
    const rows = groupTranscriptRows([readOne, assistant, ...writeItems, nextTurnWrite])
    expect(rows).toMatchObject([
      { kind: "item", item: { toolCallId: "tool-1" } },
      { kind: "item", item: { _tag: "transcript.assistant" } },
      { kind: "tool-group" },
      { kind: "item", item: { toolCallId: "write-next" } },
    ])
    const group = rows[2]
    expect(group?.kind).toBe("tool-group")
    if (group?.kind === "tool-group") {
      expect(group.items).toHaveLength(3)
      expect(summarizeTranscriptToolGroup(group.items)).toBe("Changed 3 files")
    }

    const mixed = groupTranscriptRows([readOne, ...writeItems])
    expect(mixed).toMatchObject([{ kind: "tool-group" }])
    const mixedGroup = mixed[0]
    expect(mixedGroup?.kind).toBe("tool-group")
    if (mixedGroup?.kind === "tool-group") {
      expect(summarizeTranscriptToolGroup(mixedGroup.items)).toBe("Read 1 file and changed 3 files")
    }
    expect(transcriptToolGroupLabel("other", 18)).toBe("Used 18 tools")
  })

  it("adds an empty assistant row when live paint has no journal item yet", () => {
    const user = decodeTranscript({
      _tag: "transcript.user",
      threadId: ids.thread,
      turnId: ids.turn,
      text: "Go",
    })
    expect(
      transcriptWithLiveAssistantPlaceholder([user], {
        threadId: ids.thread,
        turnId: ids.turn,
      }),
    ).toEqual([
      user,
      { _tag: "transcript.assistant", threadId: ids.thread, turnId: ids.turn, text: "" },
    ])
  })

  it("does not duplicate an assistant row that the journal already has", () => {
    const assistant = decodeTranscript({
      _tag: "transcript.assistant",
      threadId: ids.thread,
      turnId: ids.turn,
      text: "Bon",
    })
    expect(
      transcriptWithLiveAssistantPlaceholder([assistant], {
        threadId: ids.thread,
        turnId: ids.turn,
      }),
    ).toEqual([assistant])
  })

  it("concatenates earlier assistant rows of the same Turn as the live prefix", () => {
    const first = decodeTranscript({
      _tag: "transcript.assistant",
      threadId: ids.thread,
      turnId: ids.turn,
      text: "Address bar first. ",
    })
    const tool = decodeTranscript({
      _tag: "transcript.tool",
      threadId: ids.thread,
      turnId: ids.turn,
      toolCallId: "tool-1",
      name: "Read file",
      status: "completed",
    })
    const second = decodeTranscript({
      _tag: "transcript.assistant",
      threadId: ids.thread,
      turnId: ids.turn,
      text: "There's a circular import.",
    })
    const placeholder = decodeTranscript({
      _tag: "transcript.assistant",
      threadId: ids.thread,
      turnId: ids.turn,
      text: "",
    })
    const transcript = [first, tool, second, tool, placeholder]
    expect(flushedAssistantPrefix(transcript, ids.turn, transcript.length - 1)).toBe(
      "Address bar first. There's a circular import.",
    )
    expect(flushedAssistantPrefix(transcript, ids.turn, 2)).toBe("Address bar first. ")
    expect(flushedAssistantPrefix([first], ids.turn, 0)).toBe("")
  })

  it("ignores live paint that belongs to another Turn", () => {
    const user = decodeTranscript({
      _tag: "transcript.user",
      threadId: ids.thread,
      turnId: ids.turn,
      text: "Go",
    })
    expect(
      transcriptWithLiveAssistantPlaceholder([user], {
        threadId: ids.thread,
        turnId: ids.nextTurn,
      }),
    ).toEqual([user])
  })

  it("shows Session lastError and hides the interrupted notice otherwise", () => {
    expect(
      threadStatusNoticesVisible({ status: "error", lastError: "ACP indisponible" }, null),
    ).toBe(true)
    expect(threadStatusNoticesVisible({ status: "ready", lastError: null }, null)).toBe(false)
  })
})
