import { BoardSnapshot } from "@noyau/protocol/board"
import {
  DomainEvent,
  EventEnvelope,
  type DomainEvent as DomainEventType,
} from "@noyau/protocol/events"
import { Schema } from "effect"
import { describe, expect, it } from "vite-plus/test"

import {
  isTicketActivityThreadJumpable,
  ticketActivityAction,
  ticketActivityActor,
  ticketActivityActorThread,
  ticketActivityFromSnapshot,
  ticketActivityItem,
  ticketActivityParts,
  type TicketActivityContext,
} from "../src/lib/ticket-activity"

const ticketId = "30000000-0000-4000-8000-000000000001"
const dependsOnTicketId = "30000000-0000-4000-8000-000000000002"
const columnId = "20000000-0000-4000-8000-000000000001"
const otherColumnId = "20000000-0000-4000-8000-000000000002"
const threadId = "70000000-0000-4000-8000-000000000099"
const encodeEvent = Schema.encodeSync(DomainEvent)

const context: TicketActivityContext = {
  columnsById: new Map([
    [columnId, { name: "Backlog" }],
    [otherColumnId, { name: "Done" }],
  ]),
  threadsById: new Map([[threadId, { title: "MCP board management", status: "active" }]]),
  ticketsById: new Map([
    [ticketId, { title: "Ticket" }],
    [dependsOnTicketId, { title: "Prérequis" }],
  ]),
}

const envelopeFor = (event: DomainEventType, actorId = "70000000-0000-4000-8000-000000000001") =>
  Schema.decodeSync(EventEnvelope)({
    eventId: "60000000-0000-4000-8000-000000000001",
    projectId: "10000000-0000-4000-8000-000000000001",
    actorId,
    correlationId: "80000000-0000-4000-8000-000000000001",
    causationId: "90000000-0000-4000-8000-000000000001",
    occurredAt: "2026-08-19T15:30:00.000Z",
    schemaVersion: 1,
    sequence: 1,
    event: encodeEvent(event),
  })

const decodeEvent = Schema.decodeSync(DomainEvent)

describe("ticket activity", () => {
  it("maps Ticket events to detailed French actions", () => {
    const cases: ReadonlyArray<readonly [DomainEventType, string]> = [
      [
        decodeEvent({
          _tag: "ticket.created",
          ticketId,
          columnId,
          rank: "aA",
          title: "Ticket",
        }),
        "a créé le ticket « Ticket »",
      ],
      [
        decodeEvent({
          _tag: "ticket.moved",
          ticketId,
          columnId: otherColumnId,
          previousColumnId: columnId,
          rank: "aB",
        }),
        "a déplacé le ticket de « Backlog » → « Done »",
      ],
      [
        decodeEvent({
          _tag: "ticket.completed",
          ticketId,
          previousColumnId: columnId,
          doneColumnId: otherColumnId,
          rank: "aC",
        }),
        "a terminé le ticket (« Backlog » → « Done »)",
      ],
      [
        decodeEvent({ _tag: "ticket.reopened", ticketId, columnId, rank: "aD" }),
        "a rouvert le ticket vers « Backlog »",
      ],
      [decodeEvent({ _tag: "ticket.archived", ticketId }), "a archivé le ticket"],
      [
        decodeEvent({ _tag: "ticket.restored", ticketId, columnId, rank: "aE" }),
        "a restauré le ticket vers « Backlog »",
      ],
      [decodeEvent({ _tag: "ticket.assigned", ticketId }), "a modifié l’attribution"],
      [
        decodeEvent({
          _tag: "ticket.updated",
          ticketId,
          title: "Nouveau titre",
          previousTitle: "Ancien titre",
          priority: "urgent",
          previousPriority: "none",
        }),
        "a renommé le ticket de « Ancien titre » → « Nouveau titre » et a modifié la priorité de aucune → urgente",
      ],
      [
        decodeEvent({ _tag: "ticket.dependency.added", ticketId, dependsOnTicketId }),
        "a ajouté une dépendance vers « Prérequis »",
      ],
      [
        decodeEvent({ _tag: "ticket.dependency.removed", ticketId, dependsOnTicketId }),
        "a retiré une dépendance vers « Prérequis »",
      ],
      [
        decodeEvent({ _tag: "ticket.thread.linked", ticketId, threadId }),
        "a lié le ticket à « MCP board management »",
      ],
      [
        decodeEvent({ _tag: "ticket.thread.unlinked", ticketId, threadId }),
        "a retiré le lien vers « MCP board management »",
      ],
    ]

    for (const [event, expected] of cases) {
      expect(ticketActivityAction(envelopeFor(event), context)).toBe(expected)
    }
  })

  it("keeps a generic thread label when the linked Thread is gone", () => {
    expect(
      ticketActivityAction(
        envelopeFor(decodeEvent({ _tag: "ticket.thread.linked", ticketId, threadId })),
      ),
    ).toBe("a lié le ticket à un thread")
    expect(
      ticketActivityAction(
        envelopeFor(decodeEvent({ _tag: "ticket.thread.unlinked", ticketId, threadId })),
      ),
    ).toBe("a retiré le lien vers un thread")
  })

  it("exposes a jumpable Thread part for link activity", () => {
    const parts = ticketActivityParts(
      envelopeFor(decodeEvent({ _tag: "ticket.thread.linked", ticketId, threadId })),
      context,
    )

    expect(parts).toEqual([
      { kind: "text", text: "a lié le ticket à " },
      {
        kind: "thread",
        thread: {
          threadId,
          title: "MCP board management",
          availability: "active",
        },
      },
    ])
    const threadPart = parts[1]
    expect(threadPart?.kind).toBe("thread")
    if (threadPart?.kind === "thread") {
      expect(isTicketActivityThreadJumpable(threadPart.thread)).toBe(true)
    }
  })

  it("marks archived and missing Threads as not jumpable", () => {
    const archived = ticketActivityParts(
      envelopeFor(decodeEvent({ _tag: "ticket.thread.linked", ticketId, threadId })),
      {
        threadsById: new Map([
          [threadId, { title: "MCP board management", status: "archived" as const }],
        ]),
      },
    )
    const missing = ticketActivityParts(
      envelopeFor(decodeEvent({ _tag: "ticket.thread.linked", ticketId, threadId })),
    )

    expect(archived[1]).toMatchObject({
      kind: "thread",
      thread: { availability: "archived", title: "MCP board management" },
    })
    expect(missing[1]).toMatchObject({
      kind: "thread",
      thread: { availability: "missing", title: "un thread" },
    })
    const archivedThread = archived[1]
    const missingThread = missing[1]
    expect(archivedThread?.kind).toBe("thread")
    expect(missingThread?.kind).toBe("thread")
    if (archivedThread?.kind === "thread") {
      expect(isTicketActivityThreadJumpable(archivedThread.thread)).toBe(false)
    }
    if (missingThread?.kind === "thread") {
      expect(isTicketActivityThreadJumpable(missingThread.thread)).toBe(false)
    }
  })

  it("labels humans, agent threads, and legacy agent actors", () => {
    expect(ticketActivityActor("human:local")).toBe("Vous")
    expect(ticketActivityActor("human:hezaerd")).toBe("Vous")
    expect(ticketActivityActor(`agent:thread:${threadId}`, context)).toBe("MCP board management")
    expect(ticketActivityActorThread(`agent:thread:${threadId}`, context)).toEqual({
      threadId,
      title: "MCP board management",
      availability: "active",
    })
    expect(ticketActivityActor(`agent:thread:${threadId}`)).toBe("Agent")
    expect(ticketActivityActorThread(`agent:thread:${threadId}`)).toBeUndefined()
    expect(ticketActivityActor("agent:cursor:30000000-0000-4000-8000-000000000001")).toBe("Agent")
    expect(ticketActivityActor("system:cursor")).toBe("system:cursor")
    expect(ticketActivityActor("70000000-0000-4000-8000-000000000001")).toBe(
      "70000000-0000-4000-8000-000000000001",
    )
  })

  it("keeps the authoritative timestamp and a display actor", () => {
    const item = ticketActivityItem(
      envelopeFor(decodeEvent({ _tag: "ticket.archived", ticketId })),
      context,
    )

    expect(item).toMatchObject({
      actor: "70000000-0000-4000-8000-000000000001",
      action: "a archivé le ticket",
      occurredAt: "2026-08-19T15:30:00.000Z",
    })
  })

  it("renders agent thread activity with the thread title", () => {
    const item = ticketActivityItem(
      envelopeFor(
        decodeEvent({
          _tag: "ticket.updated",
          ticketId,
          title: "Nouveau titre",
          previousTitle: "Ancien titre",
        }),
        `agent:thread:${threadId}`,
      ),
      context,
    )

    expect(item).toMatchObject({
      actor: "MCP board management",
      action: "a renommé le ticket de « Ancien titre » → « Nouveau titre »",
    })
  })

  it("renders human:local activity as Vous", () => {
    const item = ticketActivityItem(
      envelopeFor(
        decodeEvent({
          _tag: "ticket.created",
          ticketId,
          columnId,
          rank: "aA",
          title: "Ticket",
        }),
        "human:local",
      ),
      context,
    )

    expect(item).toMatchObject({
      actor: "Vous",
      action: "a créé le ticket « Ticket »",
    })
  })

  it("reads persisted activity supplied by a reloaded BoardSnapshot", () => {
    const envelope = envelopeFor(decodeEvent({ _tag: "ticket.archived", ticketId }))
    const snapshot = Schema.decodeSync(BoardSnapshot)({
      snapshotSequence: 1,
      projectId: "10000000-0000-4000-8000-000000000001",
      project: {
        id: "10000000-0000-4000-8000-000000000001",
        name: "Noyau",
        workspaceRoot: "/tmp/noyau",
        available: true,
        createdAt: "2026-08-19T15:00:00.000Z",
        updatedAt: "2026-08-19T15:00:00.000Z",
      },
      columns: [],
      tickets: [],
      ticketDependencies: [],
      ticketThreads: [],
      ticketActivity: [{ ticketId, events: [Schema.encodeSync(EventEnvelope)(envelope)] }],
    })

    const activity = snapshot.ticketActivity[0]
    expect(activity).toBeDefined()
    if (activity === undefined) {
      throw new Error("Expected persisted Ticket activity")
    }
    expect(ticketActivityFromSnapshot(snapshot, activity.ticketId)).toEqual([envelope])
  })
})
