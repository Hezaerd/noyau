import type { BoardSnapshot } from "@noyau/protocol/board"
import type { EventEnvelope } from "@noyau/protocol/events"
import type { TicketId } from "@noyau/protocol/ids"
import { DateTime } from "effect"

export interface TicketActivityItem {
  readonly id: string
  readonly actor: string
  readonly action: string
  readonly occurredAt: string
}

export interface TicketActivityContext {
  readonly columnsById?: ReadonlyMap<string, { readonly name: string }>
  readonly threadsById?: ReadonlyMap<string, { readonly title: string }>
  readonly ticketsById?: ReadonlyMap<string, { readonly title: string }>
}

export const ticketActivityFromSnapshot = (
  snapshot: BoardSnapshot,
  ticketId: TicketId,
): ReadonlyArray<EventEnvelope> =>
  snapshot.ticketActivity.find((activity) => activity.ticketId === ticketId)?.events ?? []

const quote = (value: string): string => `« ${value} »`

const columnLabel = (columnId: string, context: TicketActivityContext | undefined): string =>
  context?.columnsById?.get(columnId)?.name ?? columnId

const ticketLabel = (ticketId: string, context: TicketActivityContext | undefined): string =>
  context?.ticketsById?.get(ticketId)?.title ?? ticketId

const priorityLabel = (priority: string): string => {
  switch (priority) {
    case "none":
      return "aucune"
    case "low":
      return "basse"
    case "normal":
      return "normale"
    case "high":
      return "haute"
    case "urgent":
      return "urgente"
    default:
      return priority
  }
}

const ticketUpdatedAction = (
  event: Extract<EventEnvelope["event"], { readonly _tag: "ticket.updated" }>,
): string => {
  const parts: string[] = []
  if ("title" in event && event.title !== undefined) {
    parts.push(
      event.previousTitle === undefined
        ? `a renommé le ticket en ${quote(event.title)}`
        : `a renommé le ticket de ${quote(event.previousTitle)} → ${quote(event.title)}`,
    )
  }
  if ("description" in event) {
    parts.push(event.description === null ? "a effacé la description" : "a modifié la description")
  }
  if ("priority" in event && event.priority !== undefined) {
    parts.push(
      event.previousPriority === undefined
        ? `a modifié la priorité (${priorityLabel(event.priority)})`
        : `a modifié la priorité de ${priorityLabel(event.previousPriority)} → ${priorityLabel(event.priority)}`,
    )
  }
  if ("dueAt" in event) {
    parts.push(event.dueAt === null ? "a retiré l’échéance" : "a modifié l’échéance")
  }
  if (parts.length === 0) {
    return "a mis à jour le ticket"
  }
  if (parts.length === 1) {
    return parts[0] ?? "a mis à jour le ticket"
  }
  return new Intl.ListFormat("fr", { style: "long", type: "conjunction" }).format(parts)
}

export const ticketActivityAction = (
  envelope: EventEnvelope,
  context?: TicketActivityContext,
): string => {
  switch (envelope.event._tag) {
    case "ticket.created":
      return `a créé le ticket ${quote(envelope.event.title)}`
    case "ticket.moved": {
      const destination = columnLabel(envelope.event.columnId, context)
      if (envelope.event.previousColumnId === undefined) {
        return `a déplacé le ticket vers ${quote(destination)}`
      }
      const source = columnLabel(envelope.event.previousColumnId, context)
      return `a déplacé le ticket de ${quote(source)} → ${quote(destination)}`
    }
    case "ticket.completed": {
      const from = columnLabel(envelope.event.previousColumnId, context)
      const to = columnLabel(envelope.event.doneColumnId, context)
      return `a terminé le ticket (${quote(from)} → ${quote(to)})`
    }
    case "ticket.reopened":
      return `a rouvert le ticket vers ${quote(columnLabel(envelope.event.columnId, context))}`
    case "ticket.archived":
      return "a archivé le ticket"
    case "ticket.restored":
      return `a restauré le ticket vers ${quote(columnLabel(envelope.event.columnId, context))}`
    case "ticket.assigned":
      return "a modifié l’attribution"
    case "ticket.updated":
      return ticketUpdatedAction(envelope.event)
    case "ticket.dependency.added":
      return `a ajouté une dépendance vers ${quote(ticketLabel(envelope.event.dependsOnTicketId, context))}`
    case "ticket.dependency.removed":
      return `a retiré une dépendance vers ${quote(ticketLabel(envelope.event.dependsOnTicketId, context))}`
    case "ticket.thread.linked":
      return "a lié le ticket à un thread"
    case "ticket.thread.unlinked":
      return "a retiré le lien thread"
    case "kanbanColumn.created":
      return "a créé une colonne"
    case "kanbanColumn.updated":
      return "a modifié une colonne"
    case "kanbanColumn.moved":
      return "a déplacé une colonne"
    case "kanbanColumn.deleted":
      return "a supprimé une colonne"
    default:
      return "a enregistré une activité"
  }
}

const AGENT_THREAD_PREFIX = "agent:thread:"
const LEGACY_AGENT_CURSOR_PREFIX = "agent:cursor:"

/** Label d'affichage : humain local, thread agent, ou acteur technique. */
export const ticketActivityActor = (actorId: string, context?: TicketActivityContext): string => {
  if (actorId.startsWith("human:")) {
    return "Vous"
  }
  if (actorId.startsWith(AGENT_THREAD_PREFIX)) {
    const threadId = actorId.slice(AGENT_THREAD_PREFIX.length)
    return context?.threadsById?.get(threadId)?.title ?? "Agent"
  }
  if (actorId.startsWith(LEGACY_AGENT_CURSOR_PREFIX)) {
    return "Agent"
  }
  if (actorId.startsWith("system:")) {
    return actorId
  }
  return actorId
}

export const ticketActivityItem = (
  envelope: EventEnvelope,
  context?: TicketActivityContext,
): TicketActivityItem => ({
  id: envelope.eventId,
  actor: ticketActivityActor(envelope.actorId, context),
  action: ticketActivityAction(envelope, context),
  occurredAt: DateTime.formatIso(envelope.occurredAt),
})
