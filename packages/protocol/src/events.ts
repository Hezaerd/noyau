import { Schema } from "effect"

import { MessageKind } from "./entities/message"
import {
  ActorId,
  AgentRunId,
  CommandId,
  CorrelationId,
  EventId,
  ExecutionId,
  MessageId,
  ProjectId,
  SchemaVersion,
  ThreadId,
  TicketId,
} from "./ids"
import {
  AttemptCancelled,
  AttemptCompleted,
  AttemptCreated,
  AttemptFailed,
  AttemptLeased,
  AttemptStarted,
  AttemptVerifying,
  AttemptWaitingAgent,
  AttemptWaitingHuman,
  ExecutionCancelled,
  ExecutionCompleted,
  ExecutionFailed,
  ExecutionInterrupted,
  ExecutionStarted,
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
  executionId: Schema.optionalKey(ExecutionId),
  runId: Schema.optionalKey(AgentRunId),
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
  ExecutionStarted,
  ExecutionCompleted,
  ExecutionFailed,
  ExecutionCancelled,
  ExecutionInterrupted,
  AttemptCreated,
  AttemptLeased,
  AttemptStarted,
  AttemptWaitingHuman,
  AttemptWaitingAgent,
  AttemptVerifying,
  AttemptCompleted,
  AttemptFailed,
  AttemptCancelled,
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
