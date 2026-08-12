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

/**
 * Métadonnées choisies par le client. Le control plane possède et ajoute le
 * projet, l'acteur, la corrélation, l'horodatage et la version de schéma.
 */
const commandRequestMeta = {
  commandId: CommandId,
  causationId: Schema.optionalKey(EventId),
} as const

export const TaskCreateRequest = Schema.TaggedStruct("task.create", {
  ...commandRequestMeta,
  payload: Schema.Struct({
    taskId: TaskId,
    missionId: MissionId,
    title: Schema.NonEmptyString,
    description: Schema.optionalKey(Schema.String),
    acceptanceCriteria: AcceptanceCriteria,
  }),
})
export type TaskCreateRequest = (typeof TaskCreateRequest)["Type"]

export const TaskAssignRequest = Schema.TaggedStruct("task.assign", {
  ...commandRequestMeta,
  payload: Schema.Struct({
    taskId: TaskId,
    assigneeId: ActorId,
  }),
})
export type TaskAssignRequest = (typeof TaskAssignRequest)["Type"]

/** Seules les intentions task publiques de la première tranche verticale. */
export const TaskCommandRequest = Schema.Union([TaskCreateRequest, TaskAssignRequest])
export type TaskCommandRequest = (typeof TaskCommandRequest)["Type"]

export const decodeTaskCommandRequest = Schema.decodeUnknownEffect(TaskCommandRequest)

/**
 * Enveloppe minimale de toute commande. `causationId` référence l'événement
 * qui a déclenché la commande (réaction d'un reactor), absent pour une
 * commande initiée par un humain ou par Marion.
 */
const commandMeta = {
  commandId: CommandId,
  projectId: ProjectId,
  actorId: ActorId,
  correlationId: CorrelationId,
  causationId: Schema.optionalKey(EventId),
  issuedAt: Schema.DateTimeUtcFromString,
  schemaVersion: SchemaVersion,
} as const

export const TaskCreate = Schema.TaggedStruct("task.create", {
  ...commandMeta,
  payload: Schema.Struct({
    taskId: TaskId,
    missionId: MissionId,
    title: Schema.NonEmptyString,
    description: Schema.optionalKey(Schema.String),
    acceptanceCriteria: AcceptanceCriteria,
  }),
})
export type TaskCreate = (typeof TaskCreate)["Type"]

export const TaskAssign = Schema.TaggedStruct("task.assign", {
  ...commandMeta,
  payload: Schema.Struct({
    taskId: TaskId,
    assigneeId: ActorId,
  }),
})
export type TaskAssign = (typeof TaskAssign)["Type"]

export const TaskComplete = Schema.TaggedStruct("task.complete", {
  ...commandMeta,
  payload: Schema.Struct({
    taskId: TaskId,
    summary: Schema.optionalKey(Schema.String),
  }),
})
export type TaskComplete = (typeof TaskComplete)["Type"]

export const TaskFail = Schema.TaggedStruct("task.fail", {
  ...commandMeta,
  payload: Schema.Struct({
    taskId: TaskId,
    reason: Schema.NonEmptyString,
  }),
})
export type TaskFail = (typeof TaskFail)["Type"]

export const MessageSend = Schema.TaggedStruct("message.send", {
  ...commandMeta,
  payload: Schema.Struct({
    messageId: MessageId,
    threadId: ThreadId,
    kind: MessageKind,
    body: Schema.NonEmptyString,
    replyTo: Schema.optionalKey(MessageId),
    taskId: Schema.optionalKey(TaskId),
  }),
})
export type MessageSend = (typeof MessageSend)["Type"]

export const Command = Schema.Union([TaskCreate, TaskAssign, TaskComplete, TaskFail, MessageSend])
export type Command = (typeof Command)["Type"]

/** Décodage à la frontière : toute commande entrante passe par ici. */
export const decodeCommand = Schema.decodeUnknownEffect(Command)
