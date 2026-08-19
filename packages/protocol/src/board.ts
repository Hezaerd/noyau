import { Schema } from "effect"

import { KanbanColumn } from "./entities/kanban-column"
import { Ticket } from "./entities/ticket"
import { ProjectId, TicketId } from "./ids"

/** Position de reprise opaque ; seul le control plane interprète son contenu. */
export const EventCursor = Schema.NonEmptyString.pipe(Schema.brand("EventCursor"))
export type EventCursor = (typeof EventCursor)["Type"]

/** Relation orientée du DAG : `ticketId` dépend de `dependsOnTicketId`. */
export const TicketDependency = Schema.Struct({
  ticketId: TicketId,
  dependsOnTicketId: TicketId,
})
export type TicketDependency = (typeof TicketDependency)["Type"]

/** Lecture cohérente du Tableau et de ses relations de dépendance. */
export const BoardSnapshot = Schema.Struct({
  projectId: ProjectId,
  columns: Schema.Array(KanbanColumn),
  tickets: Schema.Array(Ticket),
  ticketDependencies: Schema.Array(TicketDependency),
  cursor: EventCursor,
})
export type BoardSnapshot = (typeof BoardSnapshot)["Type"]
