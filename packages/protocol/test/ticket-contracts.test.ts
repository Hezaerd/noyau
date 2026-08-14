import { describe, expect, it } from "@effect/vitest"
import { BoardSnapshot } from "@noyau/protocol/board"
import { Command } from "@noyau/protocol/commands"
import { Execution } from "@noyau/protocol/entities/execution"
import { KanbanRank } from "@noyau/protocol/entities/kanban-column"
import { Ticket } from "@noyau/protocol/entities/ticket"
import {
  DomainEvent,
  EventEnvelope,
  type DomainEvent as DomainEventType,
} from "@noyau/protocol/events"
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
  execution: "3f8f0d70-1111-4000-8000-000000000008",
  profile: "3f8f0d70-1111-4000-8000-000000000009",
  activeColumn: "3f8f0d70-1111-4000-8000-000000000010",
  doneColumn: "3f8f0d70-1111-4000-8000-000000000011",
  dependency: "3f8f0d70-1111-4000-8000-000000000012",
  execution2: "3f8f0d70-1111-4000-8000-000000000013",
  attempt: "3f8f0d70-1111-4000-8000-000000000014",
  event2: "3f8f0d70-1111-4000-8000-000000000015",
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

const envelopeFor = (event: DomainEventType, eventId: string = ids.event) => ({
  eventId,
  projectId: ids.project,
  actorId: "human:hezaerd",
  correlationId: ids.correlation,
  causationId: ids.command,
  occurredAt: "2026-08-13T12:00:00.001Z",
  schemaVersion: 1,
  event,
})

const newTicketEvents = [
  { _tag: "execution.completed", executionId: ids.execution, ticketId: ids.ticket },
  { _tag: "execution.failed", executionId: ids.execution, ticketId: ids.ticket },
  { _tag: "execution.cancelled", executionId: ids.execution, ticketId: ids.ticket },
  { _tag: "execution.interrupted", executionId: ids.execution, ticketId: ids.ticket },
  { _tag: "attempt.created", attemptId: ids.attempt, executionId: ids.execution, number: 1 },
  { _tag: "attempt.leased", attemptId: ids.attempt, executionId: ids.execution },
  { _tag: "attempt.started", attemptId: ids.attempt, executionId: ids.execution },
  { _tag: "attempt.waitingHuman", attemptId: ids.attempt, executionId: ids.execution },
  { _tag: "attempt.waitingAgent", attemptId: ids.attempt, executionId: ids.execution },
  { _tag: "attempt.verifying", attemptId: ids.attempt, executionId: ids.execution },
  { _tag: "attempt.completed", attemptId: ids.attempt, executionId: ids.execution },
  { _tag: "attempt.failed", attemptId: ids.attempt, executionId: ids.execution },
  { _tag: "attempt.cancelled", attemptId: ids.attempt, executionId: ids.execution },
  {
    _tag: "ticket.dependency.added",
    ticketId: ids.ticket,
    dependsOnTicketId: ids.dependency,
  },
  {
    _tag: "ticket.dependency.removed",
    ticketId: ids.ticket,
    dependsOnTicketId: ids.dependency,
  },
] as const

describe("TicketCommandRequest", () => {
  it("accepte la création légère avec seulement un titre et une position", () => {
    const request = Effect.runSync(
      decodeTicketCommandRequest({
        _tag: "ticket.create",
        commandId: ids.command,
        payload: {
          ticketId: ids.ticket,
          workbenchThreadId: ids.thread,
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

describe("Ticket command refinements", () => {
  const dependencyPayload = {
    ticketId: ids.ticket,
    dependsOnTicketId: ids.dependency,
  }

  it.each(["ticket.dependency.add", "ticket.dependency.remove"] as const)(
    "ajoute %s aux unions request, Ticket et globale",
    (tag) => {
      const request = {
        _tag: tag,
        commandId: ids.command,
        payload: dependencyPayload,
      }
      const enriched = {
        ...request,
        ...commandMeta,
      }

      expect(Schema.decodeUnknownSync(TicketCommandRequest)(request)._tag).toBe(tag)
      expect(Schema.decodeUnknownSync(TicketCommand)(enriched)._tag).toBe(tag)
      expect(Schema.decodeUnknownSync(Command)(enriched)._tag).toBe(tag)
    },
  )

  it.each(["ticket.dependency.add", "ticket.dependency.remove"] as const)(
    "rejette une auto-dépendance pour %s",
    (tag) => {
      const request = {
        _tag: tag,
        commandId: ids.command,
        payload: {
          ticketId: ids.ticket,
          dependsOnTicketId: ids.ticket,
        },
      }

      expect(() => Schema.decodeUnknownSync(TicketCommandRequest)(request)).toThrow()
      expect(() =>
        Schema.decodeUnknownSync(TicketCommand)({
          ...request,
          ...commandMeta,
        }),
      ).toThrow()
    },
  )

  it("rejette un thread source identique au workbench sur request et commande", () => {
    const request = {
      _tag: "ticket.create",
      commandId: ids.command,
      payload: {
        ticketId: ids.ticket,
        workbenchThreadId: ids.thread,
        sourceThreadId: ids.thread,
        title: "Implement the board",
        placement: { columnId: ids.column },
      },
    }

    expect(() => Schema.decodeUnknownSync(TicketCommandRequest)(request)).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(TicketCommand)({
        ...request,
        ...commandMeta,
      }),
    ).toThrow()
  })

  it.each([
    {
      name: "trois colonnes distinctes",
      payload: {
        backlogColumnId: ids.column,
        activeColumnId: ids.activeColumn,
        doneColumnId: ids.doneColumn,
      },
      valid: true,
    },
    {
      name: "backlog = active",
      payload: {
        backlogColumnId: ids.column,
        activeColumnId: ids.column,
        doneColumnId: ids.doneColumn,
      },
      valid: false,
    },
    {
      name: "backlog = done",
      payload: {
        backlogColumnId: ids.column,
        activeColumnId: ids.activeColumn,
        doneColumnId: ids.column,
      },
      valid: false,
    },
    {
      name: "active = done",
      payload: {
        backlogColumnId: ids.column,
        activeColumnId: ids.activeColumn,
        doneColumnId: ids.activeColumn,
      },
      valid: false,
    },
  ])("valide board.initialize : $name", ({ payload, valid }) => {
    const decode = () =>
      Schema.decodeUnknownSync(TicketCommand)({
        _tag: "board.initialize",
        ...commandMeta,
        payload,
      })

    if (valid) {
      expect(decode()._tag).toBe("board.initialize")
    } else {
      expect(decode).toThrow()
    }
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

  it.each(["a0", "b00", "a0V", "Zz"])("accepte le KanbanRank canonique %s", (rank) => {
    expect(Schema.decodeUnknownSync(KanbanRank)(rank)).toBe(rank)
  })

  it.each(["a", "a!", "a00", "a0V0", "!", `A${"0".repeat(26)}`])(
    "rejette le KanbanRank non canonique %s",
    (rank) => {
      expect(() => Schema.decodeUnknownSync(KanbanRank)(rank)).toThrow()
    },
  )
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
    const decoded = Schema.decodeUnknownSync(TicketUpdate)({
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

describe("Ticket rejection contracts", () => {
  it.each([
    {
      _tag: "TicketDependencyAlreadyExists",
      ticketId: ids.ticket,
      dependsOnTicketId: ids.dependency,
    },
    {
      _tag: "TicketDependencyNotFound",
      ticketId: ids.ticket,
      dependsOnTicketId: ids.dependency,
    },
    { _tag: "TicketSelfDependency", ticketId: ids.ticket },
    {
      _tag: "TicketDependencyCycle",
      ticketId: ids.ticket,
      dependsOnTicketId: ids.dependency,
    },
  ])("décode l'erreur de dépendance $_tag", (error) => {
    expect(Schema.decodeUnknownSync(TicketRejection)(error)._tag).toBe(error._tag)
  })

  it("décode l'interdiction de déplacer vers Done lors d'une suppression", () => {
    const error = {
      _tag: "DoneColumnDestinationForbidden",
      destinationColumnId: ids.doneColumn,
    }

    expect(Schema.decodeUnknownSync(TicketRejection)(error)._tag).toBe(error._tag)
  })

  it("décode l'interdiction de créer un Ticket dans Done", () => {
    const error = {
      _tag: "DoneColumnCreationForbidden",
      columnId: ids.doneColumn,
    }

    expect(Schema.decodeUnknownSync(TicketRejection)(error)._tag).toBe(error._tag)
  })

  it("décode toutes les exécutions actives à confirmer", () => {
    const error = Schema.decodeUnknownSync(TicketRejection)({
      _tag: "ActiveExecutionConfirmationRequired",
      ticketId: ids.ticket,
      executionIds: [ids.execution, ids.execution2],
    })

    expect(error._tag).toBe("ActiveExecutionConfirmationRequired")
    if (error._tag === "ActiveExecutionConfirmationRequired") {
      expect(error.executionIds).toEqual([ids.execution, ids.execution2])
    }
  })

  it("rejette une confirmation sans exécution active", () => {
    expect(() =>
      Schema.decodeUnknownSync(TicketRejection)({
        _tag: "ActiveExecutionConfirmationRequired",
        ticketId: ids.ticket,
        executionIds: [],
      }),
    ).toThrow()
  })

  it("rejette l'ancien champ executionId", () => {
    expect(() =>
      Schema.decodeUnknownSync(TicketRejection)({
        _tag: "ActiveExecutionConfirmationRequired",
        ticketId: ids.ticket,
        executionId: ids.execution,
      }),
    ).toThrow()
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

  it("réserve l'initialisation du Tableau au contrat enrichi", () => {
    const command = Schema.decodeSync(Command)({
      _tag: "board.initialize",
      ...commandMeta,
      payload: {
        backlogColumnId: ids.column,
        activeColumnId: ids.activeColumn,
        doneColumnId: ids.doneColumn,
      },
    })

    expect(command._tag).toBe("board.initialize")
    const publicRequest = {
      _tag: "board.initialize",
      commandId: ids.command,
      payload: {
        backlogColumnId: ids.column,
        activeColumnId: ids.activeColumn,
        doneColumnId: ids.doneColumn,
      },
    }
    expect(() => Schema.decodeUnknownSync(TicketCommandRequest)(publicRequest)).toThrow()
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

  it("décode chaque nouveau fait via DomainEvent et EventEnvelope", () => {
    for (const event of newTicketEvents) {
      const decoded = Schema.decodeUnknownSync(DomainEvent)(event)
      expect(decoded._tag).toBe(event._tag)
      expect(Schema.decodeUnknownSync(EventEnvelope)(envelopeFor(decoded)).event._tag).toBe(
        event._tag,
      )
    }
  })

  it("couvre explicitement chaque état du cycle de vie Attempt", () => {
    const attemptTags = newTicketEvents
      .map((event) => event._tag)
      .filter((tag) => tag.startsWith("attempt."))

    expect(attemptTags).toEqual([
      "attempt.created",
      "attempt.leased",
      "attempt.started",
      "attempt.waitingHuman",
      "attempt.waitingAgent",
      "attempt.verifying",
      "attempt.completed",
      "attempt.failed",
      "attempt.cancelled",
    ])
  })

  it("accepte deux interruptions d'Execution distinctes pour le même Ticket", () => {
    const first = Schema.decodeUnknownSync(EventEnvelope)(
      envelopeFor(
        Schema.decodeUnknownSync(DomainEvent)({
          _tag: "execution.interrupted",
          executionId: ids.execution,
          ticketId: ids.ticket,
        }),
      ),
    )
    const second = Schema.decodeUnknownSync(EventEnvelope)(
      envelopeFor(
        Schema.decodeUnknownSync(DomainEvent)({
          _tag: "execution.interrupted",
          executionId: ids.execution2,
          ticketId: ids.ticket,
        }),
        ids.event2,
      ),
    )

    expect([first.event._tag, second.event._tag]).toEqual([
      "execution.interrupted",
      "execution.interrupted",
    ])
    if (
      first.event._tag === "execution.interrupted" &&
      second.event._tag === "execution.interrupted"
    ) {
      expect(first.event.ticketId).toBe(second.event.ticketId)
      expect(first.event.executionId).not.toBe(second.event.executionId)
    }
  })
})
