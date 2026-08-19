import type { EventEnvelope } from "@noyau/protocol/events"
import { DateTime } from "effect"

export interface TicketActivityItem {
  readonly id: string
  readonly actor: string
  readonly action: string
  readonly occurredAt: string
}

const ticketUpdatedAction = (
  event: Extract<EventEnvelope["event"], { readonly _tag: "ticket.updated" }>,
): string => {
  const fields = []
  if ("title" in event) {
    fields.push("le titre")
  }
  if ("description" in event) {
    fields.push("la description")
  }
  if ("priority" in event) {
    fields.push("la priorité")
  }
  if ("dueAt" in event) {
    fields.push("l’échéance")
  }
  return fields.length === 0
    ? "a mis à jour le ticket"
    : `a modifié ${new Intl.ListFormat("fr", { style: "long", type: "conjunction" }).format(fields)}`
}

export const ticketActivityAction = (envelope: EventEnvelope): string => {
  switch (envelope.event._tag) {
    case "ticket.created":
      return "a créé le ticket"
    case "ticket.moved":
      return "a déplacé le ticket"
    case "ticket.completed":
      return "a terminé le ticket"
    case "ticket.reopened":
      return "a rouvert le ticket"
    case "ticket.archived":
      return "a archivé le ticket"
    case "ticket.restored":
      return "a restauré le ticket"
    case "ticket.assigned":
      return "a modifié l’attribution"
    case "ticket.updated":
      return ticketUpdatedAction(envelope.event)
    case "ticket.dependency.added":
      return "a ajouté une dépendance"
    case "ticket.dependency.removed":
      return "a retiré une dépendance"
    case "message.sent":
      return "a envoyé un message lié au ticket"
    case "kanbanColumn.created":
      return "a créé une colonne"
    case "kanbanColumn.updated":
      return "a modifié une colonne"
    case "kanbanColumn.moved":
      return "a déplacé une colonne"
    case "kanbanColumn.deleted":
      return "a supprimé une colonne"
  }
}

export const ticketActivityItem = (envelope: EventEnvelope): TicketActivityItem => ({
  id: envelope.eventId,
  actor: envelope.actorId,
  action: ticketActivityAction(envelope),
  occurredAt: DateTime.formatIso(envelope.occurredAt),
})
