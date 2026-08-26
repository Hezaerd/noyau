import { describe, expect, it } from "@effect/vitest"
import { BoardSnapshot, TICKET_ACTIVITY_LIMIT, TicketActivity } from "@noyau/protocol/board"
import { ClientCommandRequest, Command } from "@noyau/protocol/commands"
import { KanbanRank } from "@noyau/protocol/entities/kanban-column"
import { Ticket } from "@noyau/protocol/entities/ticket"
import { DomainEvent, EventEnvelope } from "@noyau/protocol/events"
import {
  decodeTicketCommandRequest,
  TicketCommand,
  TicketCommandRequest,
  TicketUpdate,
} from "@noyau/protocol/ticket/commands"
import { TicketRejection } from "@noyau/protocol/ticket/errors"
import { TicketUpdated } from "@noyau/protocol/ticket/events"
import { Effect, Schema } from "effect"

const ids = {
  project: "3f8f0d70-1111-4000-8000-000000000001",
  column: "3f8f0d70-1111-4000-8000-000000000002",
  ticket: "3f8f0d70-1111-4000-8000-000000000003",
  thread: "3f8f0d70-1111-4000-8000-000000000004",
  command: "3f8f0d70-1111-4000-8000-000000000005",
  correlation: "3f8f0d70-1111-4000-8000-000000000006",
  event: "3f8f0d70-1111-4000-8000-000000000007",
  dependency: "3f8f0d70-1111-4000-8000-000000000010",
} as const

const commandMeta = {
  commandId: ids.command,
  projectId: ids.project,
  actorId: "human:hezaerd",
  correlationId: ids.correlation,
  issuedAt: "2026-08-13T12:00:00.000Z",
  schemaVersion: 1,
} as const

const ticket = {
  id: ids.ticket,
  projectId: ids.project,
  columnId: ids.column,
  rank: "a0",
  title: "Implement the board",
  priority: "normal",
  done: false,
  createdAt: "2026-08-13T12:00:00.000Z",
  updatedAt: "2026-08-13T12:00:00.000Z",
} as const

const project = {
  id: ids.project,
  name: "Noyau",
  workspaceRoot: "/Users/hezaerd/noyau",
  defaultModelSelection: null,
  available: true,
  createdAt: "2026-08-13T12:00:00.000Z",
  updatedAt: "2026-08-13T12:00:00.000Z",
} as const

describe("TicketCommandRequest", () => {
  it("accepte une création légère avec titre et position, sans sourceThreadId", () => {
    const request = Effect.runSync(
      decodeTicketCommandRequest({
        _tag: "ticket.create",
        commandId: ids.command,
        payload: {
          projectId: ids.project,
          ticketId: ids.ticket,
          title: "Implement the board",
          placement: { columnId: ids.column },
        },
      }),
    )

    expect(request._tag).toBe("ticket.create")
    expect(request.payload).not.toHaveProperty("sourceThreadId")
    expect(request).not.toHaveProperty("actorId")
  })

  it("retire les métadonnées possédées par le control plane", () => {
    const decode = Schema.decodeUnknownSync(TicketCommandRequest)
    const encode = Schema.encodeSync(TicketCommandRequest)
    const request = decode({
      _tag: "ticket.move",
      ...commandMeta,
      payload: {
        ticketId: ids.ticket,
        placement: { columnId: ids.column },
      },
    })

    expect(encode(request)).toEqual({
      _tag: "ticket.move",
      commandId: ids.command,
      payload: {
        ticketId: ids.ticket,
        placement: { columnId: ids.column },
      },
    })
  })

  it.each(["ticket.thread.link", "ticket.thread.unlink"] as const)(
    "expose %s dans les unions request, Ticket et globale",
    (tag) => {
      const request = {
        _tag: tag,
        commandId: ids.command,
        payload: { ticketId: ids.ticket, threadId: ids.thread },
      }
      const enriched = { ...request, ...commandMeta }

      expect(Schema.decodeSync(TicketCommandRequest)(request)._tag).toBe(tag)
      expect(Schema.decodeSync(TicketCommand)(enriched)._tag).toBe(tag)
      expect(Schema.decodeSync(Command)(enriched)._tag).toBe(tag)
      expect(Schema.decodeSync(ClientCommandRequest)(request)._tag).toBe(tag)
    },
  )
})

describe("Ticket dependencies and entities", () => {
  const dependencyPayload = {
    ticketId: ids.ticket,
    dependsOnTicketId: ids.dependency,
  }

  it.each(["ticket.dependency.add", "ticket.dependency.remove"] as const)(
    "expose %s dans les unions request, Ticket et globale",
    (tag) => {
      const request = {
        _tag: tag,
        commandId: ids.command,
        payload: dependencyPayload,
      }
      const enriched = { ...request, ...commandMeta }

      expect(Schema.decodeSync(TicketCommandRequest)(request)._tag).toBe(tag)
      expect(Schema.decodeSync(TicketCommand)(enriched)._tag).toBe(tag)
      expect(Schema.decodeSync(Command)(enriched)._tag).toBe(tag)
    },
  )

  it.each(["ticket.dependency.add", "ticket.dependency.remove"] as const)(
    "rejette une auto-dépendance pour %s",
    (tag) => {
      const request = {
        _tag: tag,
        commandId: ids.command,
        payload: { ticketId: ids.ticket, dependsOnTicketId: ids.ticket },
      }

      expect(() => Schema.decodeSync(TicketCommandRequest)(request)).toThrow()
    },
  )

  it("décode un Ticket sans sourceThreadId ni checklist", () => {
    const decoded = Schema.decodeUnknownSync(Ticket)({
      ...ticket,
      sourceThreadId: ids.thread,
      checklist: [],
    })

    expect(decoded.done).toBe(false)
    expect(decoded).not.toHaveProperty("sourceThreadId")
    expect(decoded).not.toHaveProperty("checklist")
  })

  it("décode un snapshot Board avec sequence et TicketThread", () => {
    const snapshot = Schema.decodeSync(BoardSnapshot)({
      snapshotSequence: 12,
      projectId: ids.project,
      project,
      columns: [
        {
          id: ids.column,
          projectId: ids.project,
          name: "Backlog",
          color: "#6D5BD0",
          rank: "a0",
          done: false,
          createdAt: "2026-08-13T12:00:00.000Z",
          updatedAt: "2026-08-13T12:00:00.000Z",
        },
      ],
      tickets: [ticket],
      ticketDependencies: [dependencyPayload],
      ticketThreads: [{ ticketId: ids.ticket, threadId: ids.thread }],
      ticketActivity: [],
    })

    expect(snapshot.snapshotSequence).toBe(12)
    expect(snapshot.ticketThreads).toEqual([{ ticketId: ids.ticket, threadId: ids.thread }])
    expect(snapshot.ticketActivity).toEqual([])
    expect(snapshot).not.toHaveProperty("cursor")
  })

  it("rejette un BoardSnapshot encore porté par EventCursor", () => {
    expect(() =>
      Schema.decodeUnknownSync(BoardSnapshot)({
        projectId: ids.project,
        columns: [],
        tickets: [],
        ticketDependencies: [],
        cursor: "v1:opaque",
      }),
    ).toThrow()
  })

  it("borne chaque activité Ticket dans le snapshot", () => {
    const envelope = {
      eventId: ids.event,
      sequence: 1,
      projectId: ids.project,
      actorId: "human:hezaerd",
      correlationId: ids.correlation,
      causationId: ids.command,
      occurredAt: "2026-08-13T12:00:00.000Z",
      schemaVersion: 1 as const,
      event: {
        _tag: "ticket.created",
        ticketId: ids.ticket,
        columnId: ids.column,
        rank: "a0",
        title: "Ticket",
      },
    } as const

    expect(() =>
      Schema.decodeSync(TicketActivity)({
        ticketId: ids.ticket,
        events: Array.from({ length: TICKET_ACTIVITY_LIMIT + 1 }, () => envelope),
      }),
    ).toThrow()
  })

  it.each(["a0", "b00", "a0V", "Zz"])("accepte le KanbanRank canonique %s", (rank) => {
    expect(Schema.decodeSync(KanbanRank)(rank)).toBe(rank)
  })
})

describe("Ticket update description", () => {
  it.each([
    { name: "omise", payload: { ticketId: ids.ticket }, expected: undefined },
    {
      name: "remplacée",
      payload: { ticketId: ids.ticket, description: "Nouvelle" },
      expected: "Nouvelle",
    },
    { name: "supprimée", payload: { ticketId: ids.ticket, description: null }, expected: null },
  ])("préserve la description $name dans la commande", ({ payload, expected }) => {
    const decoded = Schema.decodeSync(TicketUpdate)({
      _tag: "ticket.update",
      ...commandMeta,
      payload,
    })
    const encoded = Schema.encodeSync(TicketUpdate)(decoded)

    expect(encoded.payload.description).toBe(expected)
    expect(Object.hasOwn(encoded.payload, "description")).toBe(
      Object.hasOwn(payload, "description"),
    )
  })

  it.each([
    { name: "omise", event: { _tag: "ticket.updated", ticketId: ids.ticket }, expected: undefined },
    {
      name: "remplacée",
      event: { _tag: "ticket.updated", ticketId: ids.ticket, description: "Nouvelle" },
      expected: "Nouvelle",
    },
    {
      name: "supprimée",
      event: { _tag: "ticket.updated", ticketId: ids.ticket, description: null },
      expected: null,
    },
  ])("préserve la description $name dans l'événement", ({ event, expected }) => {
    const decoded = Schema.decodeUnknownSync(TicketUpdated)(event)
    const encoded = Schema.encodeSync(TicketUpdated)(decoded)

    expect(encoded.description).toBe(expected)
    expect(Object.hasOwn(encoded, "description")).toBe(Object.hasOwn(event, "description"))
  })
})

describe("Ticket envelopes", () => {
  it("round-trip un ticket.created sans sourceThreadId", () => {
    const envelope = Schema.decodeUnknownSync(EventEnvelope)({
      eventId: ids.event,
      sequence: 3,
      projectId: ids.project,
      actorId: "human:hezaerd",
      correlationId: ids.correlation,
      causationId: ids.command,
      occurredAt: "2026-08-13T12:00:00.001Z",
      schemaVersion: 1,
      event: {
        _tag: "ticket.created",
        ticketId: ids.ticket,
        columnId: ids.column,
        rank: "a0",
        title: "Implement the board",
        sourceThreadId: ids.thread,
      },
    })

    expect(envelope.event._tag).toBe("ticket.created")
    expect(envelope.event).not.toHaveProperty("sourceThreadId")
    expect(Schema.encodeSync(EventEnvelope)(envelope).sequence).toBe(3)
  })

  it.each(["message.sent", "execution.started", "channel.created"])(
    "rejette l'ancien fait %s",
    (tag) => {
      expect(() =>
        Schema.decodeUnknownSync(DomainEvent)({
          _tag: tag,
          ticketId: ids.ticket,
        }),
      ).toThrow()
    },
  )
})

describe("Ticket rejection contracts", () => {
  it.each([
    {
      _tag: "TicketDependencyAlreadyExists",
      ticketId: ids.ticket,
      dependsOnTicketId: ids.dependency,
    },
    { _tag: "TicketThreadProjectMismatch", ticketId: ids.ticket, threadId: ids.thread },
  ])("décode l'erreur $_tag", (error) => {
    expect(Schema.decodeUnknownSync(TicketRejection)(error)._tag).toBe(error._tag)
  })
})
