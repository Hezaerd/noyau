import { describe, expect, it } from "@effect/vitest"
import { ClientCommandRequest, Command } from "@noyau/protocol/commands"
import { ResumeCursor, Session } from "@noyau/protocol/entities/session"
import { Thread } from "@noyau/protocol/entities/thread"
import { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import { TranscriptItem } from "@noyau/protocol/entities/transcript"
import { CheckpointRef, checkpointRefForTurn, Turn } from "@noyau/protocol/entities/turn"
import { EventEnvelope } from "@noyau/protocol/events"
import { ThreadId } from "@noyau/protocol/ids"
import { Receipt } from "@noyau/protocol/receipts"
import { ThreadStreamItem } from "@noyau/protocol/rpc"
import {
  decodeThreadCommandRequest,
  InternalThreadCommand,
  ThreadCommandRequest,
  ThreadTurnStartRequest,
  ThreadTurnStart,
} from "@noyau/protocol/thread/commands"
import { ThreadAssistantLive } from "@noyau/protocol/thread/live"
import {
  canReplaceThreadTitle,
  DEFAULT_THREAD_TITLE,
  seedTitleFromPrompt,
  seedTitleFromTurn,
} from "@noyau/protocol/thread/title"
import { GetTurnDiffInput, TurnDiffPatch } from "@noyau/protocol/turn-diff"
import { Effect, Schema } from "effect"

const ids = {
  project: "10000000-0000-4000-8000-000000000001",
  thread: "20000000-0000-4000-8000-000000000001",
  turn: "30000000-0000-4000-8000-000000000001",
  command: "70000000-0000-4000-8000-000000000001",
  correlation: "80000000-0000-4000-8000-000000000001",
  event: "90000000-0000-4000-8000-000000000001",
} as const

const commandMeta = {
  commandId: ids.command,
  projectId: ids.project,
  actorId: "human:hezaerd",
  correlationId: ids.correlation,
  issuedAt: "2026-08-19T12:00:00.000Z",
  schemaVersion: 1,
} as const

const resumeCursor = {
  schemaVersion: 1 as const,
  sessionId: "cursor-session-abc",
}

describe("resumeCursor", () => {
  it("décode et réencode { schemaVersion: 1, sessionId }", () => {
    const decoded = Schema.decodeSync(ResumeCursor)(resumeCursor)
    expect(Schema.encodeSync(ResumeCursor)(decoded)).toEqual(resumeCursor)
  })

  it("rejette schemaVersion autre que 1 et cwdLastBound comme contrat", () => {
    expect(() =>
      Schema.decodeUnknownSync(ResumeCursor)({
        schemaVersion: 2,
        sessionId: "cursor-session-abc",
      }),
    ).toThrow()

    const decoded = Schema.decodeUnknownSync(ResumeCursor)({
      ...resumeCursor,
      cwdLastBound: "/tmp/old",
    })
    expect(decoded).not.toHaveProperty("cwdLastBound")
  })
})

describe("Thread and Session entities", () => {
  it("décode un Thread titré, provider cursor et runtimeMode", () => {
    const thread = Schema.decodeUnknownSync(Thread)({
      id: ids.thread,
      projectId: ids.project,
      title: "Relier le dossier",
      provider: "cursor",
      runtimeMode: "full-access",
      modelSelection: null,
      status: "active",
      session: null,
      latestTurn: null,
      createdAt: "2026-08-19T12:00:00.000Z",
      updatedAt: "2026-08-19T12:00:00.000Z",
      permissionMode: "ask",
    })

    expect(thread.provider).toBe("cursor")
    expect(thread.runtimeMode).toBe("full-access")
    expect(thread).not.toHaveProperty("permissionMode")
    expect(thread).not.toHaveProperty("channelId")
  })

  it("décode une Session projetée sans id métier", () => {
    const session = Schema.decodeSync(Session)({
      threadId: ids.thread,
      status: "error",
      lastError: "rupture",
      activeTurnId: ids.turn,
      runtimeMode: "approval-required",
      resumeCursor,
      updatedAt: "2026-08-19T12:00:00.000Z",
    })

    expect(session).not.toHaveProperty("id")
    expect(session.resumeCursor).toEqual(resumeCursor)
  })

  it("round-trip un ThreadSnapshot avec transcript texte", () => {
    const snapshot = {
      snapshotSequence: 8,
      thread: {
        id: ids.thread,
        projectId: ids.project,
        title: "Premier prompt",
        provider: "cursor",
        runtimeMode: "auto",
        modelSelection: {
          modelId: "composer-2.5",
          reasoningEffort: "high",
          serviceTier: "fast",
          thinking: false,
        },
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
        resumeCursor,
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
    }

    const decoded = Schema.decodeUnknownSync(ThreadSnapshot)(snapshot)
    expect(Schema.encodeSync(ThreadSnapshot)(decoded).snapshotSequence).toBe(8)
  })

  it("round-trip un Turn avec TurnDiff", () => {
    const turn = Schema.decodeSync(Turn)({
      id: ids.turn,
      threadId: ids.thread,
      ordinal: 1,
      state: "completed",
      requestedAt: "2026-08-19T12:00:00.000Z",
      startedAt: "2026-08-19T12:00:00.100Z",
      completedAt: "2026-08-19T12:00:02.000Z",
      turnDiff: {
        checkpointRef: checkpointRefForTurn(ThreadId.make(ids.thread), 1),
        status: "ready",
        files: [{ path: "src/app.ts", kind: "modified", additions: 2, deletions: 0 }],
      },
    })
    expect(turn.turnDiff?.files[0]?.path).toBe("src/app.ts")
  })

  it("exige un UUID dans CheckpointRef", () => {
    expect(Schema.decodeSync(CheckpointRef)(`refs/noyau/checkpoint/${ids.thread}/0`)).toBe(
      `refs/noyau/checkpoint/${ids.thread}/0`,
    )
    expect(() =>
      Schema.decodeSync(CheckpointRef)(`refs/noyau/checkpoint/${"-".repeat(36)}/1`),
    ).toThrow()
    expect(() => Schema.decodeSync(CheckpointRef)("refs/noyau/checkpoint/not-a-uuid/1")).toThrow()
  })

  it("round-trip un TurnDiffPatch", () => {
    const input = Schema.decodeSync(GetTurnDiffInput)({
      threadId: ids.thread,
      turnId: ids.turn,
      ignoreWhitespace: true,
    })
    expect(input.ignoreWhitespace).toBe(true)
    const patch = Schema.decodeSync(TurnDiffPatch)({
      threadId: ids.thread,
      turnId: ids.turn,
      checkpointRef: checkpointRefForTurn(ThreadId.make(ids.thread), 1),
      patch: "diff --git a/src.ts b/src.ts\n",
    })
    expect(patch.patch.startsWith("diff --git")).toBe(true)
  })
})

describe("Thread commands", () => {
  it("décode une présentation de Turn optionnelle", () => {
    const request = {
      _tag: "thread.turn.start" as const,
      commandId: ids.command,
      payload: {
        threadId: ids.thread,
        text: "PR #12 conflicts with main.",
        presentation: "fix-merge-conflicts" as const,
        titleSeed: "Fix merge conflicts",
      },
    }
    expect(Schema.decodeSync(ThreadTurnStartRequest)(request).payload.presentation).toBe(
      "fix-merge-conflicts",
    )
    expect(
      Schema.decodeSync(ThreadTurnStartRequest)({
        ...request,
        payload: {
          ...request.payload,
          text: "PR #12 has failing CI.",
          presentation: "fix-ci" as const,
          titleSeed: "Fix CI",
        },
      }).payload.presentation,
    ).toBe("fix-ci")
    const user = Schema.decodeSync(TranscriptItem)({
      _tag: "transcript.user",
      threadId: ids.thread,
      turnId: ids.turn,
      text: "PR #12 conflicts with main.",
      presentation: "fix-merge-conflicts",
    })
    expect(user._tag).toBe("transcript.user")
    if (user._tag === "transcript.user") {
      expect(user.presentation).toBe("fix-merge-conflicts")
    }
  })

  it("décode thread.turn.start texte seul sans acteur", () => {
    const request = {
      _tag: "thread.turn.start" as const,
      commandId: ids.command,
      payload: {
        threadId: ids.thread,
        text: "Continue depuis le Tableau",
      },
    }

    const decoded = Schema.decodeSync(ThreadCommandRequest)(request)
    expect(decoded).not.toHaveProperty("actorId")
    expect(Schema.encodeSync(ThreadCommandRequest)(decoded)).toEqual(request)
    expect(Schema.decodeSync(ClientCommandRequest)(request)._tag).toBe("thread.turn.start")
  })

  it("décode une modelSelection et permet de revenir au choix automatique", () => {
    const selected = Schema.decodeSync(ThreadTurnStartRequest)({
      _tag: "thread.turn.start",
      commandId: ids.command,
      payload: {
        threadId: ids.thread,
        text: "Analyse en profondeur",
        modelSelection: {
          modelId: "composer-2.5",
          reasoningEffort: "high",
          serviceTier: "fast",
          thinking: true,
        },
      },
    })
    expect(selected.payload.modelSelection).toEqual({
      modelId: "composer-2.5",
      reasoningEffort: "high",
      serviceTier: "fast",
      thinking: true,
    })

    const automatic = Schema.decodeSync(ThreadTurnStartRequest)({
      _tag: "thread.turn.start",
      commandId: ids.command,
      payload: { threadId: ids.thread, text: "Choisis", modelSelection: null },
    })
    expect(automatic.payload.modelSelection).toBeNull()
  })

  it("accepte un upload image sur thread.turn.start et refuse le dataUrl sur la commande enrichie", () => {
    const upload = {
      type: "image" as const,
      name: "shot.png",
      mimeType: "image/png" as const,
      sizeBytes: 3,
      dataUrl: "data:image/png;base64,AAAA",
    }
    const request = {
      _tag: "thread.turn.start" as const,
      commandId: ids.command,
      payload: {
        threadId: ids.thread,
        text: "Voici une capture",
        attachments: [upload],
      },
    }

    const decoded = Schema.decodeSync(ThreadTurnStartRequest)(request)
    expect(decoded.payload.attachments).toEqual([upload])
    expect(Effect.runSync(decodeThreadCommandRequest(request))._tag).toBe("thread.turn.start")

    expect(() =>
      Schema.decodeUnknownSync(ThreadTurnStart)({ ...request, ...commandMeta }),
    ).toThrow()

    const persisted = Schema.decodeSync(ThreadTurnStart)({
      ...request,
      ...commandMeta,
      payload: {
        threadId: ids.thread,
        text: "Voici une capture",
        attachments: [
          {
            type: "image",
            id: `${ids.command}-0`,
            name: "shot.png",
            mimeType: "image/png",
            sizeBytes: 3,
          },
        ],
      },
    })
    expect(persisted.payload.attachments?.[0]?.id).toBe(`${ids.command}-0`)
  })

  it("accepte un Turn image-only et rejette image/images hors attachments", () => {
    const imageOnly = Schema.decodeSync(ThreadTurnStartRequest)({
      _tag: "thread.turn.start",
      commandId: ids.command,
      payload: {
        threadId: ids.thread,
        attachments: [
          {
            type: "image",
            name: "shot.png",
            mimeType: "image/png",
            sizeBytes: 3,
            dataUrl: "data:image/png;base64,AAAA",
          },
        ],
      },
    })
    expect(imageOnly.payload.text).toBeUndefined()

    expect(() =>
      Schema.decodeSync(ThreadCommandRequest)({
        _tag: "thread.turn.start",
        commandId: ids.command,
        payload: {
          threadId: ids.thread,
          text: "Prompt",
          images: [{ name: "screen.png" }],
        },
      }),
    ).toThrow()
  })

  it("n'expose pas les commandes internes au renderer", () => {
    const internal = {
      _tag: "thread.session.set",
      commandId: ids.command,
      payload: {
        threadId: ids.thread,
        session: {
          threadId: ids.thread,
          status: "ready",
          lastError: null,
          activeTurnId: null,
          runtimeMode: "full-access",
          resumeCursor,
          updatedAt: "2026-08-19T12:00:01.000Z",
        },
      },
    }

    expect(() => Schema.decodeUnknownSync(ThreadCommandRequest)(internal)).toThrow()
    expect(() => Schema.decodeUnknownSync(ClientCommandRequest)(internal)).toThrow()

    const enriched = { ...internal, ...commandMeta }
    expect(Schema.decodeUnknownSync(InternalThreadCommand)(enriched)._tag).toBe(
      "thread.session.set",
    )
    expect(Schema.decodeUnknownSync(Command)(enriched)._tag).toBe("thread.session.set")
  })

  it("décode thread.turn.diff.complete comme commande interne seulement", () => {
    const complete = {
      _tag: "thread.turn.diff.complete",
      commandId: ids.command,
      payload: {
        threadId: ids.thread,
        turnId: ids.turn,
        checkpointRef: `refs/noyau/checkpoint/${ids.thread}/1`,
        status: "ready",
        files: [{ path: "src/app.ts", kind: "modified", additions: 2, deletions: 1 }],
      },
    }
    expect(() => Schema.decodeUnknownSync(ThreadCommandRequest)(complete)).toThrow()
    expect(
      Schema.decodeUnknownSync(InternalThreadCommand)({ ...complete, ...commandMeta })._tag,
    ).toBe("thread.turn.diff.complete")
  })

  it.each([
    "thread.create",
    "thread.archive",
    "thread.restore",
    "thread.settle",
    "thread.unsettle",
    "thread.meta.update",
    "thread.runtime-mode.set",
    "thread.model-selection.set",
    "thread.turn.interrupt",
    "approval.respond",
    "user-input.respond",
    "session.stop",
  ] as const)("accepte la commande client %s", (tag) => {
    const payloads = {
      "thread.create": {
        threadId: ids.thread,
        projectId: ids.project,
        title: "Nouveau thread",
        runtimeMode: "full-access",
      },
      "thread.archive": { threadId: ids.thread },
      "thread.restore": { threadId: ids.thread },
      "thread.settle": { threadId: ids.thread },
      "thread.unsettle": { threadId: ids.thread, reason: "user" },
      "thread.meta.update": { threadId: ids.thread, title: "Titre" },
      "thread.runtime-mode.set": { threadId: ids.thread, runtimeMode: "auto-accept-edits" },
      "thread.model-selection.set": {
        threadId: ids.thread,
        modelSelection: {
          modelId: "composer-2.5",
          reasoningEffort: "high",
          serviceTier: "fast",
        },
      },
      "thread.turn.interrupt": { threadId: ids.thread },
      "approval.respond": {
        threadId: ids.thread,
        requestId: "req-1",
        decision: "accept",
      },
      "user-input.respond": {
        threadId: ids.thread,
        requestId: "req-2",
        answers: { q: { optionIds: ["yes"] } },
      },
      "session.stop": { threadId: ids.thread },
    } as const

    const request = { _tag: tag, commandId: ids.command, payload: payloads[tag] }
    expect(Schema.decodeUnknownSync(ThreadCommandRequest)(request)._tag).toBe(tag)
  })

  it("accepte thread.meta.update avec un Checkout seul", () => {
    const request = {
      _tag: "thread.meta.update" as const,
      commandId: ids.command,
      payload: {
        threadId: ids.thread,
        branch: "main",
        worktreePath: null,
      },
    }
    expect(Schema.decodeSync(ThreadCommandRequest)(request).payload).toEqual({
      threadId: ids.thread,
      branch: "main",
      worktreePath: null,
    })
  })

  it("accepte thread.meta.update avec regenerateTitle seul", () => {
    const request = {
      _tag: "thread.meta.update" as const,
      commandId: ids.command,
      payload: { threadId: ids.thread, regenerateTitle: true as const },
    }
    expect(Schema.decodeSync(ThreadCommandRequest)(request).payload).toEqual({
      threadId: ids.thread,
      regenerateTitle: true,
    })
  })

  it("rejette title et regenerateTitle ensemble", () => {
    expect(() =>
      Schema.decodeSync(ThreadCommandRequest)({
        _tag: "thread.meta.update",
        commandId: ids.command,
        payload: { threadId: ids.thread, title: "Titre", regenerateTitle: true },
      }),
    ).toThrow()
  })

  it("rejette permissionMode comme tag de commande", () => {
    expect(() =>
      Schema.decodeUnknownSync(ThreadCommandRequest)({
        _tag: "thread.permission-mode.set",
        commandId: ids.command,
        payload: { threadId: ids.thread, permissionMode: "ask" },
      }),
    ).toThrow()
  })
})

describe("Thread events and receipts", () => {
  it("round-trip un événement de Session et un receipt accepté à sequence", () => {
    const envelope = Schema.decodeSync(EventEnvelope)({
      eventId: ids.event,
      sequence: 44,
      projectId: ids.project,
      actorId: "system",
      correlationId: ids.correlation,
      causationId: ids.command,
      occurredAt: "2026-08-19T12:00:02.000Z",
      schemaVersion: 1,
      event: {
        _tag: "thread.session-set",
        threadId: ids.thread,
        session: {
          threadId: ids.thread,
          status: "interrupted",
          lastError: null,
          activeTurnId: ids.turn,
          runtimeMode: "full-access",
          resumeCursor,
          updatedAt: "2026-08-19T12:00:02.000Z",
        },
      },
    })

    expect(Schema.encodeSync(EventEnvelope)(envelope).sequence).toBe(44)

    const receipt = Schema.decodeSync(Receipt)({
      commandId: ids.command,
      response: { _tag: "accepted", sequence: 44 },
    })
    expect(receipt.response).toEqual({ _tag: "accepted", sequence: 44 })
  })
})

describe("ThreadAssistantLive", () => {
  it("round-trip un hint live hors journal", () => {
    const live = Schema.decodeSync(ThreadAssistantLive)({
      threadId: ids.thread,
      turnId: ids.turn,
      text: "Bonjour",
    })
    const frame = Schema.decodeSync(ThreadStreamItem)({
      kind: "live",
      live,
    })
    expect(frame.kind).toBe("live")
    if (frame.kind === "live") {
      expect(frame.live.text).toBe("Bonjour")
    }
  })
})

describe("Thread title helpers", () => {
  it("sème un titre compact depuis le premier prompt", () => {
    expect(seedTitleFromPrompt("  Corriger le flux de reprise  ")).toBe(
      "Corriger le flux de reprise",
    )
    expect(seedTitleFromTurn(undefined, [{ name: "shot.png" }])).toBe("shot.png")
    expect(seedTitleFromPrompt(`"Titre entre quotes"`)).toBe("Titre entre quotes")
    expect(seedTitleFromPrompt("A".repeat(80))).toBe(`${"A".repeat(47)}...`)
  })

  it("autorise le remplacement du placeholder ou du seed seulement", () => {
    expect(canReplaceThreadTitle(DEFAULT_THREAD_TITLE)).toBe(true)
    expect(canReplaceThreadTitle("Inspecte le projet", "Inspecte le projet")).toBe(true)
    expect(canReplaceThreadTitle("Titre manuel", "Inspecte le projet")).toBe(false)
  })
})
