import { Schema } from "effect"

import { MessageKind } from "./entities/message"
import {
  ActorId,
  CommandId,
  CorrelationId,
  EventId,
  MessageId,
  ProjectId,
  SchemaVersion,
  ThreadId,
  TicketId,
} from "./ids"
import {
  KanbanColumnCreated,
  KanbanColumnDeleted,
  KanbanColumnMoved,
  KanbanColumnUpdated,
  TicketArchived,
  TicketAssigned,
  TicketCompleted,
  TicketCreated,
  TicketDependencyAdded,
  TicketDependencyRemoved,
  TicketMoved,
  TicketReopened,
  TicketRestored,
  TicketUpdated,
} from "./ticket/events"

export const MessageSent = Schema.TaggedStruct("message.sent", {
  messageId: MessageId,
  threadId: ThreadId,
  kind: MessageKind,
  body: Schema.NonEmptyString,
  replyTo: Schema.optionalKey(MessageId),
  ticketId: Schema.optionalKey(TicketId),
})
export type MessageSent = (typeof MessageSent)["Type"]

export const MessageEvent = Schema.Union([MessageSent])
export type MessageEvent = (typeof MessageEvent)["Type"]

export const DomainEvent = Schema.Union([
  MessageSent,
  TicketCreated,
  TicketMoved,
  TicketCompleted,
  TicketReopened,
  TicketArchived,
  TicketRestored,
  TicketAssigned,
  TicketUpdated,
  TicketDependencyAdded,
  TicketDependencyRemoved,
  KanbanColumnCreated,
  KanbanColumnUpdated,
  KanbanColumnMoved,
  KanbanColumnDeleted,
])
export type DomainEvent = (typeof DomainEvent)["Type"]

/**
 * Événement tel que persisté dans le journal append-only. `causationId`
 * référence la commande dont le decider a produit ce fait.
 */
export const EventEnvelope = Schema.Struct({
  eventId: EventId,
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
