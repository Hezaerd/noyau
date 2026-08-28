import { Schema } from "effect"

import {
  ActorId,
  CommandId,
  CorrelationId,
  EventId,
  ProjectId,
  SchemaVersion,
  Sequence,
} from "./ids.ts"
import { ProjectEvent } from "./project/events.ts"
import { ThreadEvent } from "./thread/events.ts"
import { TicketEvent } from "./ticket/events.ts"

export const DomainEvent = Schema.Union([ProjectEvent, TicketEvent, ThreadEvent])
export type DomainEvent = (typeof DomainEvent)["Type"]

/**
 * Fait persisté dans le journal append-only. `sequence` est le curseur global.
 * `causationId` référence la commande dont le decider a produit ce fait.
 */
export const EventEnvelope = Schema.Struct({
  eventId: EventId,
  sequence: Sequence,
  projectId: ProjectId,
  actorId: ActorId,
  correlationId: CorrelationId,
  causationId: CommandId,
  occurredAt: Schema.DateTimeUtcFromString,
  schemaVersion: SchemaVersion,
  event: DomainEvent,
})
export type EventEnvelope = (typeof EventEnvelope)["Type"]

export const decodeEventEnvelope = Schema.decodeUnknownEffect(EventEnvelope)
