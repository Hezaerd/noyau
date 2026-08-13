import { describe, expect, it } from "@effect/vitest"
import { BoardSnapshot } from "@noyau/protocol/board"
import { Command } from "@noyau/protocol/commands"
import { Execution } from "@noyau/protocol/entities/execution"
import { Ticket } from "@noyau/protocol/entities/ticket"
import { EventEnvelope } from "@noyau/protocol/events"
import { decodeTicketCommandRequest, TicketCommandRequest } from "@noyau/protocol/ticket/commands"
import { Effect, Schema } from "effect"

const ids = {
  project: "3f8f0d70-1111-4000-8000-000000000001",
  column: "3f8f0d70-1111-4000-8000-000000000002",
  ticket: "3f8f0d70-1111-4000-8000-000000000003",
  thread: "3f8f0d70-1111-4000-8000-000000000004",
  command: "3f8f0d70-1111-4000-8000-000000000005",
  correlation: "3f8f0d70-1111-4000-8000-000000000006",
  event: "3f8f0d70-1111-4000-8000-000000000007",
  execution: "3f8f0d70-1111-4000-8000-000000000008",
  profile: "3f8f0d70-1111-4000-8000-000000000009",
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
  participantIds: [],
  labelIds: [],
  checklist: [],
  attachmentIds: [],
  workbenchThreadId: ids.thread,
  createdAt: "2026-08-13T12:00:00.000Z",
  updatedAt: "2026-08-13T12:00:00.000Z",
} as const

describe("TicketCommandRequest", () => {
  it("accepte la création légère avec seulement un titre et une position", () => {
    const request = Effect.runSync(
      decodeTicketCommandRequest({
        _tag: "ticket.create",
        commandId: ids.command,
        payload: {
          ticketId: ids.ticket,
          title: "Implement the board",
          placement: { columnId: ids.column },
        },
      }),
    )

    expect(request._tag).toBe("ticket.create")
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
})

describe("Ticket protocol entities", () => {
  it("décode un Ticket sans état technique d'exécution", () => {
    const decoded = Schema.decodeSync(Ticket)(ticket)

    expect(decoded.done).toBe(false)
    expect("status" in decoded).toBe(false)
  })

  it("rejette un budget d'exécution sans timeout positif", () => {
    expect(() =>
      Schema.decodeSync(Execution)({
        id: ids.execution,
        ticketId: ids.ticket,
        projectId: ids.project,
        expectedOutcome: "A working board",
        agentProfileId: ids.profile,
        budget: { maxTokens: 10_000, timeoutSeconds: 0 },
        toolPolicy: { allowed: ["read", "edit"] },
        createdAt: "2026-08-13T12:00:00.000Z",
      }),
    ).toThrow()
  })

  it("décode un snapshot compact du Tableau", () => {
    const snapshot = Schema.decodeSync(BoardSnapshot)({
      projectId: ids.project,
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
      cursor: "v1:opaque",
    })

    expect(snapshot.tickets).toHaveLength(1)
  })
})

describe("Ticket command and event envelopes", () => {
  it("ajoute les commandes Ticket au contrat enrichi", () => {
    const command = Schema.decodeSync(Command)({
      _tag: "ticket.complete",
      ...commandMeta,
      payload: {
        ticketId: ids.ticket,
        acknowledgeOpenDependencies: true,
      },
    })

    expect(command._tag).toBe("ticket.complete")
  })

  it("décode un fait Ticket persisté", () => {
    const envelope = Schema.decodeSync(EventEnvelope)({
      eventId: ids.event,
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
        workbenchThreadId: ids.thread,
      },
    })

    expect(envelope.event._tag).toBe("ticket.created")
  })
})
