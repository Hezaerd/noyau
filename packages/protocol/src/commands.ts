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
  BoardInitialize,
  ExecutionStart,
  KanbanColumnCreate,
  KanbanColumnDelete,
  KanbanColumnMove,
  KanbanColumnUpdate,
  TicketArchive,
  TicketAssign,
  TicketComplete,
  TicketCreate,
  TicketDependencyAdd,
  TicketDependencyRemove,
  TicketMove,
  TicketReopen,
  TicketRestore,
  TicketUpdate,
} from "./ticket/commands"

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

export const MessageSend = Schema.TaggedStruct("message.send", {
  ...commandMeta,
  payload: Schema.Struct({
    messageId: MessageId,
    threadId: ThreadId,
    kind: MessageKind,
    body: Schema.NonEmptyString,
    replyTo: Schema.optionalKey(MessageId),
    ticketId: Schema.optionalKey(TicketId),
    executionId: Schema.optionalKey(ExecutionId),
    runId: Schema.optionalKey(AgentRunId),
  }),
})
export type MessageSend = (typeof MessageSend)["Type"]

export const Command = Schema.Union([
  MessageSend,
  TicketCreate,
  TicketMove,
  TicketComplete,
  TicketReopen,
  TicketArchive,
  TicketRestore,
  TicketAssign,
  TicketUpdate,
  TicketDependencyAdd,
  TicketDependencyRemove,
  ExecutionStart,
  KanbanColumnCreate,
  KanbanColumnUpdate,
  KanbanColumnMove,
  KanbanColumnDelete,
  BoardInitialize,
])
export type Command = (typeof Command)["Type"]

/** Décodage à la frontière : toute commande entrante passe par ici. */
export const decodeCommand = Schema.decodeUnknownEffect(Command)
