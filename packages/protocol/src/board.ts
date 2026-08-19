import { KanbanColumn } from "@noyau/protocol/entities/kanban-column"
import { Project } from "@noyau/protocol/entities/project"
import { Ticket } from "@noyau/protocol/entities/ticket"
import { TicketThread } from "@noyau/protocol/entities/ticket-thread"
import { ProjectId, Sequence, TicketId } from "@noyau/protocol/ids"
import { Schema } from "effect"

/** Relation orientée du DAG : `ticketId` dépend de `dependsOnTicketId`. */
export const TicketDependency = Schema.Struct({
  ticketId: TicketId,
  dependsOnTicketId: TicketId,
})
export type TicketDependency = (typeof TicketDependency)["Type"]

/** Lecture cohérente du Tableau, de son DAG et des liens Ticket–Thread. */
export const BoardSnapshot = Schema.Struct({
  snapshotSequence: Sequence,
  projectId: ProjectId,
  project: Project,
  columns: Schema.Array(KanbanColumn),
  tickets: Schema.Array(Ticket),
  ticketDependencies: Schema.Array(TicketDependency),
  ticketThreads: Schema.Array(TicketThread),
})
export type BoardSnapshot = (typeof BoardSnapshot)["Type"]
