import { KanbanColumn } from "@noyau/contracts/entities/kanban-column"
import { Project } from "@noyau/contracts/entities/project"
import { Ticket } from "@noyau/contracts/entities/ticket"
import { TicketThread } from "@noyau/contracts/entities/ticket-thread"
import { EventEnvelope } from "@noyau/contracts/events"
import { ProjectId, Sequence, TicketId } from "@noyau/contracts/ids"
import { Schema } from "effect"

export const TICKET_ACTIVITY_LIMIT = 50

/** Relation orientée du DAG : `ticketId` dépend de `dependsOnTicketId`. */
export const TicketDependency = Schema.Struct({
  ticketId: TicketId,
  dependsOnTicketId: TicketId,
})
export type TicketDependency = (typeof TicketDependency)["Type"]

/** Faits persistés les plus récents d'un Ticket, bornés dans le snapshot Tableau. */
export const TicketActivity = Schema.Struct({
  ticketId: TicketId,
  events: Schema.Array(EventEnvelope).check(Schema.isMaxLength(TICKET_ACTIVITY_LIMIT)),
})
export type TicketActivity = (typeof TicketActivity)["Type"]

/** Lecture cohérente du Tableau, de son DAG et des liens Ticket–Thread. */
export const BoardSnapshot = Schema.Struct({
  snapshotSequence: Sequence,
  projectId: ProjectId,
  project: Project,
  columns: Schema.Array(KanbanColumn),
  tickets: Schema.Array(Ticket),
  ticketDependencies: Schema.Array(TicketDependency),
  ticketThreads: Schema.Array(TicketThread),
  ticketActivity: Schema.Array(TicketActivity),
})
export type BoardSnapshot = (typeof BoardSnapshot)["Type"]
