import { Schema } from "effect"

import { MessageKind } from "./entities/message"
import { AcceptanceCriteria } from "./entities/task"
import {
  ActorId,
  CommandId,
  CorrelationId,
  EventId,
  MessageId,
  MissionId,
  ProjectId,
  SchemaVersion,
  TaskId,
  ThreadId,
} from "./ids"

// Faits immuables produits par les deciders purs. L'enveloppe (identité,
// horodatage, corrélation) est ajoutée par le control plane au moment de la
// persistance — un decider pur ne génère ni UUID ni horloge.

export const TaskCreated = Schema.TaggedStruct("task.created", {
  taskId: TaskId,
  missionId: MissionId,
  title: Schema.NonEmptyString,
  description: Schema.optionalKey(Schema.String),
  acceptanceCriteria: AcceptanceCriteria,
})
export type TaskCreated = (typeof TaskCreated)["Type"]

export const TaskAssigned = Schema.TaggedStruct("task.assigned", {
  taskId: TaskId,
  assigneeId: ActorId,
})
export type TaskAssigned = (typeof TaskAssigned)["Type"]

export const TaskCompleted = Schema.TaggedStruct("task.completed", {
  taskId: TaskId,
  summary: Schema.optionalKey(Schema.String),
})
export type TaskCompleted = (typeof TaskCompleted)["Type"]

export const TaskFailed = Schema.TaggedStruct("task.failed", {
  taskId: TaskId,
  reason: Schema.NonEmptyString,
})
export type TaskFailed = (typeof TaskFailed)["Type"]

export const MessageSent = Schema.TaggedStruct("message.sent", {
  messageId: MessageId,
  threadId: ThreadId,
  kind: MessageKind,
  body: Schema.NonEmptyString,
  replyTo: Schema.optionalKey(MessageId),
  taskId: Schema.optionalKey(TaskId),
})
export type MessageSent = (typeof MessageSent)["Type"]

export const TaskEvent = Schema.Union([TaskCreated, TaskAssigned, TaskCompleted, TaskFailed])
export type TaskEvent = (typeof TaskEvent)["Type"]

export const MessageEvent = Schema.Union([MessageSent])
export type MessageEvent = (typeof MessageEvent)["Type"]

export const DomainEvent = Schema.Union([
  TaskCreated,
  TaskAssigned,
  TaskCompleted,
  TaskFailed,
  MessageSent,
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
