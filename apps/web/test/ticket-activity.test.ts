import {
  DomainEvent,
  EventEnvelope,
  type DomainEvent as DomainEventType,
} from "@noyau/protocol/events"
import { Schema } from "effect"
import { describe, expect, it } from "vite-plus/test"

import { ticketActivityAction, ticketActivityItem } from "../src/lib/ticket-activity"

const ticketId = "30000000-0000-4000-8000-000000000001"
const dependsOnTicketId = "30000000-0000-4000-8000-000000000002"
const columnId = "20000000-0000-4000-8000-000000000001"
const otherColumnId = "20000000-0000-4000-8000-000000000002"
const encodeEvent = Schema.encodeSync(DomainEvent)

const envelopeFor = (event: DomainEventType) =>
  Schema.decodeSync(EventEnvelope)({
    eventId: "60000000-0000-4000-8000-000000000001",
    projectId: "10000000-0000-4000-8000-000000000001",
    actorId: "70000000-0000-4000-8000-000000000001",
    correlationId: "80000000-0000-4000-8000-000000000001",
    causationId: "90000000-0000-4000-8000-000000000001",
    occurredAt: "2026-08-19T15:30:00.000Z",
    schemaVersion: 1,
    event: encodeEvent(event),
  })

const decodeEvent = Schema.decodeSync(DomainEvent)

describe("ticket activity", () => {
  it("maps every Ticket v1 event tag to a French action", () => {
    const cases: ReadonlyArray<readonly [DomainEventType, string]> = [
      [
        decodeEvent({
          _tag: "ticket.created",
          ticketId,
          columnId,
          rank: "aA",
          title: "Ticket",
        }),
        "a créé le ticket",
      ],
      [
        decodeEvent({ _tag: "ticket.moved", ticketId, columnId, rank: "aB" }),
        "a déplacé le ticket",
      ],
      [
        decodeEvent({
          _tag: "ticket.completed",
          ticketId,
          previousColumnId: columnId,
          doneColumnId: otherColumnId,
          rank: "aC",
        }),
        "a terminé le ticket",
      ],
      [
        decodeEvent({ _tag: "ticket.reopened", ticketId, columnId, rank: "aD" }),
        "a rouvert le ticket",
      ],
      [decodeEvent({ _tag: "ticket.archived", ticketId }), "a archivé le ticket"],
      [
        decodeEvent({ _tag: "ticket.restored", ticketId, columnId, rank: "aE" }),
        "a restauré le ticket",
      ],
      [decodeEvent({ _tag: "ticket.assigned", ticketId }), "a modifié l’attribution"],
      [
        decodeEvent({
          _tag: "ticket.updated",
          ticketId,
          title: "Nouveau titre",
          priority: "urgent",
        }),
        "a modifié le titre et la priorité",
      ],
      [
        decodeEvent({ _tag: "ticket.dependency.added", ticketId, dependsOnTicketId }),
        "a ajouté une dépendance",
      ],
      [
        decodeEvent({ _tag: "ticket.dependency.removed", ticketId, dependsOnTicketId }),
        "a retiré une dépendance",
      ],
    ]

    for (const [event, expected] of cases) {
      expect(ticketActivityAction(envelopeFor(event))).toBe(expected)
    }
  })

  it("keeps the authoritative actor and timestamp", () => {
    const item = ticketActivityItem(envelopeFor(decodeEvent({ _tag: "ticket.archived", ticketId })))

    expect(item).toMatchObject({
      actor: "70000000-0000-4000-8000-000000000001",
      action: "a archivé le ticket",
      occurredAt: "2026-08-19T15:30:00.000Z",
    })
  })
})
