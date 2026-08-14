import { Schema } from "effect"

import { KanbanColumn } from "./entities/kanban-column"
import { Ticket } from "./entities/ticket"
import { ProjectId } from "./ids"

/** Position de reprise opaque ; seul le control plane interprète son contenu. */
export const EventCursor = Schema.NonEmptyString.pipe(Schema.brand("EventCursor"))
export type EventCursor = (typeof EventCursor)["Type"]

/**
 * Lecture compacte du Tableau. Workbench, activité et exécutions sont chargés
 * séparément à l'ouverture d'un Ticket.
 */
export const BoardSnapshot = Schema.Struct({
  projectId: ProjectId,
  columns: Schema.Array(KanbanColumn),
  tickets: Schema.Array(Ticket),
  cursor: EventCursor,
})
export type BoardSnapshot = (typeof BoardSnapshot)["Type"]
