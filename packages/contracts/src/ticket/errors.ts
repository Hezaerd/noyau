import { KanbanColumnId, ThreadId, TicketId } from "@noyau/contracts/ids"
import { Schema } from "effect"

export class TicketAlreadyExists extends Schema.TaggedError<TicketAlreadyExists>()(
  "TicketAlreadyExists",
  { ticketId: TicketId },
) {}

export class TicketNotFound extends Schema.TaggedError<TicketNotFound>()("TicketNotFound", {
  ticketId: TicketId,
}) {}

export class KanbanColumnAlreadyExists extends Schema.TaggedError<KanbanColumnAlreadyExists>()(
  "KanbanColumnAlreadyExists",
  { columnId: KanbanColumnId },
) {}

export class KanbanColumnNotFound extends Schema.TaggedError<KanbanColumnNotFound>()(
  "KanbanColumnNotFound",
  { columnId: KanbanColumnId },
) {}

export class InvalidTicketPlacement extends Schema.TaggedError<InvalidTicketPlacement>()(
  "InvalidTicketPlacement",
  {
    columnId: KanbanColumnId,
    beforeTicketId: Schema.optionalKey(TicketId),
    afterTicketId: Schema.optionalKey(TicketId),
  },
) {}

export class InvalidColumnPlacement extends Schema.TaggedError<InvalidColumnPlacement>()(
  "InvalidColumnPlacement",
  {
    beforeColumnId: Schema.optionalKey(KanbanColumnId),
    afterColumnId: Schema.optionalKey(KanbanColumnId),
  },
) {}

export class ProtectedDoneColumn extends Schema.TaggedError<ProtectedDoneColumn>()(
  "ProtectedDoneColumn",
  { columnId: KanbanColumnId },
) {}

export class ColumnDestinationRequired extends Schema.TaggedError<ColumnDestinationRequired>()(
  "ColumnDestinationRequired",
  { columnId: KanbanColumnId },
) {}

export class DoneColumnDestinationForbidden extends Schema.TaggedError<DoneColumnDestinationForbidden>()(
  "DoneColumnDestinationForbidden",
  { destinationColumnId: KanbanColumnId },
) {}

export class DoneColumnCreationForbidden extends Schema.TaggedError<DoneColumnCreationForbidden>()(
  "DoneColumnCreationForbidden",
  { columnId: KanbanColumnId },
) {}

export class TicketDependencyAlreadyExists extends Schema.TaggedError<TicketDependencyAlreadyExists>()(
  "TicketDependencyAlreadyExists",
  {
    ticketId: TicketId,
    dependsOnTicketId: TicketId,
  },
) {}

export class TicketDependencyNotFound extends Schema.TaggedError<TicketDependencyNotFound>()(
  "TicketDependencyNotFound",
  {
    ticketId: TicketId,
    dependsOnTicketId: TicketId,
  },
) {}

export class TicketSelfDependency extends Schema.TaggedError<TicketSelfDependency>()(
  "TicketSelfDependency",
  { ticketId: TicketId },
) {}

export class TicketDependencyCycle extends Schema.TaggedError<TicketDependencyCycle>()(
  "TicketDependencyCycle",
  {
    ticketId: TicketId,
    dependsOnTicketId: TicketId,
  },
) {}

export class TicketAlreadyArchived extends Schema.TaggedError<TicketAlreadyArchived>()(
  "TicketAlreadyArchived",
  { ticketId: TicketId },
) {}

export class TicketNotArchived extends Schema.TaggedError<TicketNotArchived>()(
  "TicketNotArchived",
  {
    ticketId: TicketId,
  },
) {}

export class TicketAlreadyCompleted extends Schema.TaggedError<TicketAlreadyCompleted>()(
  "TicketAlreadyCompleted",
  { ticketId: TicketId },
) {}

export class TicketNotCompleted extends Schema.TaggedError<TicketNotCompleted>()(
  "TicketNotCompleted",
  { ticketId: TicketId },
) {}

export class OpenDependenciesConfirmationRequired extends Schema.TaggedError<OpenDependenciesConfirmationRequired>()(
  "OpenDependenciesConfirmationRequired",
  { ticketId: TicketId },
) {}

export class TicketThreadAlreadyLinked extends Schema.TaggedError<TicketThreadAlreadyLinked>()(
  "TicketThreadAlreadyLinked",
  {
    ticketId: TicketId,
    threadId: ThreadId,
  },
) {}

export class TicketThreadNotLinked extends Schema.TaggedError<TicketThreadNotLinked>()(
  "TicketThreadNotLinked",
  {
    ticketId: TicketId,
    threadId: ThreadId,
  },
) {}

export class TicketThreadProjectMismatch extends Schema.TaggedError<TicketThreadProjectMismatch>()(
  "TicketThreadProjectMismatch",
  {
    ticketId: TicketId,
    threadId: ThreadId,
  },
) {}

export const TicketRejection = Schema.Union([
  TicketAlreadyExists,
  TicketNotFound,
  KanbanColumnAlreadyExists,
  KanbanColumnNotFound,
  InvalidTicketPlacement,
  InvalidColumnPlacement,
  ProtectedDoneColumn,
  ColumnDestinationRequired,
  DoneColumnDestinationForbidden,
  DoneColumnCreationForbidden,
  TicketDependencyAlreadyExists,
  TicketDependencyNotFound,
  TicketSelfDependency,
  TicketDependencyCycle,
  TicketAlreadyArchived,
  TicketNotArchived,
  TicketAlreadyCompleted,
  TicketNotCompleted,
  OpenDependenciesConfirmationRequired,
  TicketThreadAlreadyLinked,
  TicketThreadNotLinked,
  TicketThreadProjectMismatch,
])
export type TicketRejection = (typeof TicketRejection)["Type"]
