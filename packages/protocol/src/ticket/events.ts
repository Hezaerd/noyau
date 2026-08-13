import { ExecutionBudget, ToolPolicy } from "@noyau/protocol/entities/execution"
import { KanbanColumnColor, KanbanRank } from "@noyau/protocol/entities/kanban-column"
import { TicketPriority } from "@noyau/protocol/entities/ticket"
import {
  ActorId,
  AgentProfileId,
  ExecutionId,
  KanbanColumnId,
  ThreadId,
  TicketId,
} from "@noyau/protocol/ids"
import { Schema } from "effect"

export const TicketCreated = Schema.TaggedStruct("ticket.created", {
  ticketId: TicketId,
  columnId: KanbanColumnId,
  rank: KanbanRank,
  title: Schema.NonEmptyString,
  workbenchThreadId: ThreadId,
  sourceThreadId: Schema.optionalKey(ThreadId),
})
export type TicketCreated = (typeof TicketCreated)["Type"]

export const TicketMoved = Schema.TaggedStruct("ticket.moved", {
  ticketId: TicketId,
  columnId: KanbanColumnId,
  rank: KanbanRank,
})
export type TicketMoved = (typeof TicketMoved)["Type"]

export const TicketCompleted = Schema.TaggedStruct("ticket.completed", {
  ticketId: TicketId,
  previousColumnId: KanbanColumnId,
  doneColumnId: KanbanColumnId,
  rank: KanbanRank,
})
export type TicketCompleted = (typeof TicketCompleted)["Type"]

export const TicketReopened = Schema.TaggedStruct("ticket.reopened", {
  ticketId: TicketId,
  columnId: KanbanColumnId,
  rank: KanbanRank,
})
export type TicketReopened = (typeof TicketReopened)["Type"]

export const TicketArchived = Schema.TaggedStruct("ticket.archived", {
  ticketId: TicketId,
})
export type TicketArchived = (typeof TicketArchived)["Type"]

export const TicketRestored = Schema.TaggedStruct("ticket.restored", {
  ticketId: TicketId,
  columnId: KanbanColumnId,
  rank: KanbanRank,
})
export type TicketRestored = (typeof TicketRestored)["Type"]

export const TicketAssigned = Schema.TaggedStruct("ticket.assigned", {
  ticketId: TicketId,
  assigneeId: Schema.optionalKey(ActorId),
})
export type TicketAssigned = (typeof TicketAssigned)["Type"]

export const TicketUpdated = Schema.TaggedStruct("ticket.updated", {
  ticketId: TicketId,
  title: Schema.optionalKey(Schema.NonEmptyString),
  description: Schema.optionalKey(Schema.String),
  priority: Schema.optionalKey(TicketPriority),
  dueAt: Schema.optionalKey(Schema.NullOr(Schema.DateTimeUtcFromString)),
})
export type TicketUpdated = (typeof TicketUpdated)["Type"]

export const ExecutionStarted = Schema.TaggedStruct("execution.started", {
  executionId: ExecutionId,
  ticketId: TicketId,
  expectedOutcome: Schema.NonEmptyString,
  agentProfileId: AgentProfileId,
  budget: ExecutionBudget,
  toolPolicy: ToolPolicy,
})
export type ExecutionStarted = (typeof ExecutionStarted)["Type"]

export const KanbanColumnCreated = Schema.TaggedStruct("kanbanColumn.created", {
  columnId: KanbanColumnId,
  name: Schema.NonEmptyString,
  color: KanbanColumnColor,
  rank: KanbanRank,
  done: Schema.Boolean,
})
export type KanbanColumnCreated = (typeof KanbanColumnCreated)["Type"]

export const KanbanColumnUpdated = Schema.TaggedStruct("kanbanColumn.updated", {
  columnId: KanbanColumnId,
  name: Schema.optionalKey(Schema.NonEmptyString),
  color: Schema.optionalKey(KanbanColumnColor),
})
export type KanbanColumnUpdated = (typeof KanbanColumnUpdated)["Type"]

export const KanbanColumnMoved = Schema.TaggedStruct("kanbanColumn.moved", {
  columnId: KanbanColumnId,
  rank: KanbanRank,
})
export type KanbanColumnMoved = (typeof KanbanColumnMoved)["Type"]

export const KanbanColumnDeleted = Schema.TaggedStruct("kanbanColumn.deleted", {
  columnId: KanbanColumnId,
  destinationColumnId: Schema.optionalKey(KanbanColumnId),
})
export type KanbanColumnDeleted = (typeof KanbanColumnDeleted)["Type"]

export const TicketEvent = Schema.Union([
  TicketCreated,
  TicketMoved,
  TicketCompleted,
  TicketReopened,
  TicketArchived,
  TicketRestored,
  TicketAssigned,
  TicketUpdated,
  ExecutionStarted,
  KanbanColumnCreated,
  KanbanColumnUpdated,
  KanbanColumnMoved,
  KanbanColumnDeleted,
])
export type TicketEvent = (typeof TicketEvent)["Type"]
