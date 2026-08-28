import { ActorId, KanbanColumnId, ProjectId, TicketId } from "@noyau/contracts/ids"
import { Schema } from "effect"

import { KanbanRank } from "./kanban-column.ts"

export const TicketPriority = Schema.Literals(["none", "low", "normal", "high", "urgent"])
export type TicketPriority = (typeof TicketPriority)["Type"]

/** Élément de travail durable du Tableau. Les liens Thread passent par TicketThread. */
export class Ticket extends Schema.Class<Ticket>("@noyau/contracts/entities/Ticket")({
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
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}
