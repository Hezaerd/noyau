import { KanbanColumnColor, KanbanRank } from "@noyau/protocol/entities/kanban-column"
import { TicketPriority } from "@noyau/protocol/entities/ticket"
import { ActorId, KanbanColumnId, ThreadId, TicketId } from "@noyau/protocol/ids"
import { Schema } from "effect"

export const TicketCreated = Schema.TaggedStruct("ticket.created", {
  ticketId: TicketId,
  columnId: KanbanColumnId,
  rank: KanbanRank,
  title: Schema.NonEmptyString,
})
export type TicketCreated = (typeof TicketCreated)["Type"]

export const TicketMoved = Schema.TaggedStruct("ticket.moved", {
  ticketId: TicketId,
  columnId: KanbanColumnId,
  /** Présent sur les faits récents ; absent des événements historiques. */
  previousColumnId: Schema.optionalKey(KanbanColumnId),
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
  /** Titre avant la mutation, seulement quand `title` est présent. */
  previousTitle: Schema.optionalKey(Schema.NonEmptyString),
  /** Omission = inchangé, chaîne = remplacement, null = suppression explicite. */
  description: Schema.optionalKey(Schema.NullOr(Schema.String)),
  priority: Schema.optionalKey(TicketPriority),
  /** Priorité avant la mutation, seulement quand `priority` est présent. */
  previousPriority: Schema.optionalKey(TicketPriority),
  dueAt: Schema.optionalKey(Schema.NullOr(Schema.DateTimeUtcFromString)),
})
export type TicketUpdated = (typeof TicketUpdated)["Type"]

export const TicketDependencyAdded = Schema.TaggedStruct("ticket.dependency.added", {
  ticketId: TicketId,
  dependsOnTicketId: TicketId,
})
export type TicketDependencyAdded = (typeof TicketDependencyAdded)["Type"]

export const TicketDependencyRemoved = Schema.TaggedStruct("ticket.dependency.removed", {
  ticketId: TicketId,
  dependsOnTicketId: TicketId,
})
export type TicketDependencyRemoved = (typeof TicketDependencyRemoved)["Type"]

export const TicketThreadLinked = Schema.TaggedStruct("ticket.thread.linked", {
  ticketId: TicketId,
  threadId: ThreadId,
})
export type TicketThreadLinked = (typeof TicketThreadLinked)["Type"]

export const TicketThreadUnlinked = Schema.TaggedStruct("ticket.thread.unlinked", {
  ticketId: TicketId,
  threadId: ThreadId,
})
export type TicketThreadUnlinked = (typeof TicketThreadUnlinked)["Type"]

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

/**
 * Le domaine fournit une destination dès qu'une référence visible ou cachée existe.
 */
export const KanbanColumnDeleted = Schema.TaggedStruct("kanbanColumn.deleted", {
  columnId: KanbanColumnId,
  destinationColumnId: Schema.optionalKey(KanbanColumnId),
})
export type KanbanColumnDeleted = (typeof KanbanColumnDeleted)["Type"]

export const BoardInitialized = Schema.TaggedStruct("board.initialized", {
  backlogColumnId: KanbanColumnId,
  activeColumnId: KanbanColumnId,
  doneColumnId: KanbanColumnId,
})
export type BoardInitialized = (typeof BoardInitialized)["Type"]

export const TicketEvent = Schema.Union([
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
  TicketThreadLinked,
  TicketThreadUnlinked,
  KanbanColumnCreated,
  KanbanColumnUpdated,
  KanbanColumnMoved,
  KanbanColumnDeleted,
  BoardInitialized,
])
export type TicketEvent = (typeof TicketEvent)["Type"]
