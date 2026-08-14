import {
  ActorId,
  AttachmentId,
  ChecklistItemId,
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

export class ChecklistItem extends Schema.Class<ChecklistItem>(
  "@noyau/protocol/entities/ChecklistItem",
)({
  id: ChecklistItemId,
  title: Schema.NonEmptyString,
  completed: Schema.Boolean,
  convertedTicketId: Schema.optionalKey(TicketId),
}) {}

/**
 * Élément de travail durable du Tableau. Les états techniques d'agents vivent
 * sur Execution et Attempt, jamais sur Ticket.
 */
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
  checklist: Schema.Array(ChecklistItem),
  attachmentIds: Schema.Array(AttachmentId),
  workbenchThreadId: ThreadId,
  sourceThreadId: Schema.optionalKey(ThreadId),
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}
