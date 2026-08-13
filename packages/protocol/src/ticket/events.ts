import { ExecutionBudget, ToolPolicy } from "@noyau/protocol/entities/execution"
import { KanbanColumnColor, KanbanRank } from "@noyau/protocol/entities/kanban-column"
import { TicketPriority } from "@noyau/protocol/entities/ticket"
import {
  ActorId,
  AgentProfileId,
  AttemptId,
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
  /** Omission = inchangé, chaîne = remplacement, null = suppression explicite. */
  description: Schema.optionalKey(Schema.NullOr(Schema.String)),
  priority: Schema.optionalKey(TicketPriority),
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

export const ExecutionStarted = Schema.TaggedStruct("execution.started", {
  executionId: ExecutionId,
  ticketId: TicketId,
  expectedOutcome: Schema.NonEmptyString,
  agentProfileId: AgentProfileId,
  budget: ExecutionBudget,
  toolPolicy: ToolPolicy,
})
export type ExecutionStarted = (typeof ExecutionStarted)["Type"]

export const ExecutionCompleted = Schema.TaggedStruct("execution.completed", {
  executionId: ExecutionId,
  ticketId: TicketId,
})
export type ExecutionCompleted = (typeof ExecutionCompleted)["Type"]

export const ExecutionFailed = Schema.TaggedStruct("execution.failed", {
  executionId: ExecutionId,
  ticketId: TicketId,
})
export type ExecutionFailed = (typeof ExecutionFailed)["Type"]

export const ExecutionCancelled = Schema.TaggedStruct("execution.cancelled", {
  executionId: ExecutionId,
  ticketId: TicketId,
})
export type ExecutionCancelled = (typeof ExecutionCancelled)["Type"]

export const ExecutionInterrupted = Schema.TaggedStruct("execution.interrupted", {
  executionId: ExecutionId,
  ticketId: TicketId,
})
export type ExecutionInterrupted = (typeof ExecutionInterrupted)["Type"]

export const AttemptCreated = Schema.TaggedStruct("attempt.created", {
  attemptId: AttemptId,
  executionId: ExecutionId,
  number: Schema.Int.check(Schema.isGreaterThan(0)),
})
export type AttemptCreated = (typeof AttemptCreated)["Type"]

export const AttemptLeased = Schema.TaggedStruct("attempt.leased", {
  attemptId: AttemptId,
  executionId: ExecutionId,
})
export type AttemptLeased = (typeof AttemptLeased)["Type"]

export const AttemptStarted = Schema.TaggedStruct("attempt.started", {
  attemptId: AttemptId,
  executionId: ExecutionId,
})
export type AttemptStarted = (typeof AttemptStarted)["Type"]

export const AttemptWaitingHuman = Schema.TaggedStruct("attempt.waitingHuman", {
  attemptId: AttemptId,
  executionId: ExecutionId,
})
export type AttemptWaitingHuman = (typeof AttemptWaitingHuman)["Type"]

export const AttemptWaitingAgent = Schema.TaggedStruct("attempt.waitingAgent", {
  attemptId: AttemptId,
  executionId: ExecutionId,
})
export type AttemptWaitingAgent = (typeof AttemptWaitingAgent)["Type"]

export const AttemptVerifying = Schema.TaggedStruct("attempt.verifying", {
  attemptId: AttemptId,
  executionId: ExecutionId,
})
export type AttemptVerifying = (typeof AttemptVerifying)["Type"]

export const AttemptCompleted = Schema.TaggedStruct("attempt.completed", {
  attemptId: AttemptId,
  executionId: ExecutionId,
})
export type AttemptCompleted = (typeof AttemptCompleted)["Type"]

export const AttemptFailed = Schema.TaggedStruct("attempt.failed", {
  attemptId: AttemptId,
  executionId: ExecutionId,
})
export type AttemptFailed = (typeof AttemptFailed)["Type"]

/**
 * Une interruption d'Execution annule son Attempt actif : Attempt ne porte pas d'état interrupted.
 */
export const AttemptCancelled = Schema.TaggedStruct("attempt.cancelled", {
  attemptId: AttemptId,
  executionId: ExecutionId,
})
export type AttemptCancelled = (typeof AttemptCancelled)["Type"]

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
export type TicketEvent = (typeof TicketEvent)["Type"]
