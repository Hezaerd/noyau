import { describe, expect, it } from "@effect/vitest"
import { ClientCommandRequest, Command } from "@noyau/protocol/commands"
import { ResumeCursor, Session } from "@noyau/protocol/entities/session"
import { Thread } from "@noyau/protocol/entities/thread"
import { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import { EventEnvelope } from "@noyau/protocol/events"
import { Receipt } from "@noyau/protocol/receipts"
import {
  decodeThreadCommandRequest,
  InternalThreadCommand,
  ThreadCommandRequest,
  ThreadTurnStart,
} from "@noyau/protocol/thread/commands"
import {
  canReplaceThreadTitle,
  DEFAULT_THREAD_TITLE,
  seedTitleFromPrompt,
} from "@noyau/protocol/thread/title"
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
})

describe("Thread commands", () => {
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

  it("rejette un payload image sur thread.turn.start", () => {
    const withImage = {
      _tag: "thread.turn.start",
      commandId: ids.command,
      payload: {
        threadId: ids.thread,
        text: "Voici une capture",
        attachments: [
          {
            type: "image",
            name: "shot.png",
            mimeType: "image/png",
            sizeBytes: 128,
            dataUrl: "data:image/png;base64,AAAA",
          },
        ],
      },
    }

    expect(() => Schema.decodeUnknownSync(ThreadCommandRequest)(withImage)).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(ThreadTurnStart)({ ...withImage, ...commandMeta }),
    ).toThrow()
    expect(() => Effect.runSync(decodeThreadCommandRequest(withImage))).toThrow()
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

  it.each([
    "thread.create",
    "thread.archive",
    "thread.restore",
    "thread.meta.update",
    "thread.runtime-mode.set",
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
      "thread.meta.update": { threadId: ids.thread, title: "Titre" },
      "thread.runtime-mode.set": { threadId: ids.thread, runtimeMode: "auto-accept-edits" },
      "thread.turn.interrupt": { threadId: ids.thread },
      "approval.respond": {
        threadId: ids.thread,
        requestId: "req-1",
        decision: "accept",
      },
      "user-input.respond": {
        threadId: ids.thread,
        requestId: "req-2",
        answers: { q: "yes" },
      },
      "session.stop": { threadId: ids.thread },
    } as const

    const request = { _tag: tag, commandId: ids.command, payload: payloads[tag] }
    expect(Schema.decodeUnknownSync(ThreadCommandRequest)(request)._tag).toBe(tag)
  })

  it("accepte thread.meta.update avec regenerateTitle seul", () => {
    const request = {
      _tag: "thread.meta.update" as const,
      commandId: ids.command,
      payload: { threadId: ids.thread, regenerateTitle: true as const },
    }
    expect(Schema.decodeUnknownSync(ThreadCommandRequest)(request).payload).toEqual({
      threadId: ids.thread,
      regenerateTitle: true,
    })
  })

  it("rejette title et regenerateTitle ensemble", () => {
    expect(() =>
      Schema.decodeUnknownSync(ThreadCommandRequest)({
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

describe("Thread title helpers", () => {
  it("sème un titre compact depuis le premier prompt", () => {
    expect(seedTitleFromPrompt("  Corriger le flux de reprise  ")).toBe(
      "Corriger le flux de reprise",
    )
    expect(seedTitleFromPrompt(`"Titre entre quotes"`)).toBe("Titre entre quotes")
    expect(seedTitleFromPrompt("A".repeat(80))).toBe(`${"A".repeat(47)}...`)
  })

  it("autorise le remplacement du placeholder ou du seed seulement", () => {
    expect(canReplaceThreadTitle(DEFAULT_THREAD_TITLE)).toBe(true)
    expect(canReplaceThreadTitle("Inspecte le projet", "Inspecte le projet")).toBe(true)
    expect(canReplaceThreadTitle("Titre manuel", "Inspecte le projet")).toBe(false)
  })
})
