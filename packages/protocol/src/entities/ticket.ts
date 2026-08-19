import {
  ActorId,
  AttachmentId,
  KanbanColumnId,
  LabelId,
  ProjectId,
  ThreadId,
  TicketId,
} from "@noyau/protocol/ids"
import { Schema } from "effect"

import { KanbanRank } from "./kanban-column"

export const TicketPriority = Schema.Literals(["none", "low", "normal", "high", "urgent"])
export type TicketPriority = (typeof TicketPriority)["Type"]

/** Élément de travail durable du Tableau. */
export class Ticket extends Schema.Class<Ticket>("@noyau/protocol/entities/Ticket")({
  id: TicketId,
  projectId: ProjectId,
  columnId: KanbanColumnId,
  rank: KanbanRank,
  title: Schema.NonEmptyString,
  description: Schema.optionalKey(Schema.String),
  priority: TicketPriority,
  dueAt: Schema.optionalKey(Schema.DateTimeUtcFromString),
  done: Schema.Boolean,
  archivedAt: Schema.optionalKey(Schema.DateTimeUtcFromString),
  lastActiveColumnId: Schema.optionalKey(KanbanColumnId),
  assigneeId: Schema.optionalKey(ActorId),
  participantIds: Schema.Array(ActorId),
  labelIds: Schema.Array(LabelId),
  attachmentIds: Schema.Array(AttachmentId),
  sourceThreadId: Schema.optionalKey(ThreadId),
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}
