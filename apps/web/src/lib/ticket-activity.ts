import type { BoardSnapshot } from "@noyau/contracts/board"
import type { EventEnvelope } from "@noyau/contracts/events"
import type { TicketId } from "@noyau/contracts/ids"
import { DateTime } from "effect"

export type TicketActivityThreadAvailability = "active" | "archived" | "missing"

export interface TicketActivityThreadRef {
  readonly threadId: string
  readonly title: string
  readonly availability: TicketActivityThreadAvailability
}

export type TicketActivityPart =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "thread"; readonly thread: TicketActivityThreadRef }

export interface TicketActivityItem {
  readonly id: string
  readonly actor: string
  readonly actorThread?: TicketActivityThreadRef
  readonly action: string
  readonly parts: ReadonlyArray<TicketActivityPart>
  readonly occurredAt: string
}

export interface TicketActivityThreadMeta {
  readonly title: string
  readonly status: "active" | "archived"
}

export interface TicketActivityContext {
  readonly columnsById?: ReadonlyMap<string, { readonly name: string }>
  readonly threadsById?: ReadonlyMap<string, TicketActivityThreadMeta>
  readonly ticketsById?: ReadonlyMap<string, { readonly title: string }>
}

export const isTicketActivityThreadJumpable = (thread: TicketActivityThreadRef): boolean =>
  thread.availability === "active"

export const ticketActivityFromSnapshot = (
  snapshot: BoardSnapshot,
  ticketId: TicketId,
): ReadonlyArray<EventEnvelope> =>
  snapshot.ticketActivity.find((activity) => activity.ticketId === ticketId)?.events ?? []

const quote = (value: string): string => `"${value}"`

const MISSING_THREAD_TITLE = "a thread"

export const ticketActivityThreadRef = (
  threadId: string,
  context: TicketActivityContext | undefined,
): TicketActivityThreadRef => {
  const thread = context?.threadsById?.get(threadId)
  if (thread === undefined) {
    return { threadId, title: MISSING_THREAD_TITLE, availability: "missing" }
  }
  return {
    threadId,
    title: thread.title,
    availability: thread.status === "archived" ? "archived" : "active",
  }
}

const flattenTicketActivityParts = (parts: ReadonlyArray<TicketActivityPart>): string =>
  parts
    .map((part) => {
      if (part.kind === "text") {
        return part.text
      }
      return part.thread.availability === "missing" ? part.thread.title : quote(part.thread.title)
    })
    .join("")

const threadActionParts = (
  prefix: string,
  threadId: string,
  context: TicketActivityContext | undefined,
): ReadonlyArray<TicketActivityPart> => [
  { kind: "text", text: prefix },
  { kind: "thread", thread: ticketActivityThreadRef(threadId, context) },
]

const columnLabel = (columnId: string, context: TicketActivityContext | undefined): string =>
  context?.columnsById?.get(columnId)?.name ?? columnId

const ticketLabel = (ticketId: string, context: TicketActivityContext | undefined): string =>
  context?.ticketsById?.get(ticketId)?.title ?? ticketId

const priorityLabel = (priority: string): string => {
  switch (priority) {
    case "none":
      return "none"
    case "low":
      return "low"
    case "normal":
      return "normal"
    case "high":
      return "high"
    case "urgent":
      return "urgent"
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
        ? `renamed the ticket to ${quote(event.title)}`
        : `renamed the ticket from ${quote(event.previousTitle)} → ${quote(event.title)}`,
    )
  }
  if ("description" in event) {
    parts.push(event.description === null ? "cleared the description" : "updated the description")
  }
  if ("priority" in event && event.priority !== undefined) {
    parts.push(
      event.previousPriority === undefined
        ? `changed the priority (${priorityLabel(event.priority)})`
        : `changed the priority from ${priorityLabel(event.previousPriority)} → ${priorityLabel(event.priority)}`,
    )
  }
  if ("dueAt" in event) {
    parts.push(event.dueAt === null ? "cleared the due date" : "changed the due date")
  }
  if (parts.length === 0) {
    return "updated the ticket"
  }
  if (parts.length === 1) {
    return parts[0] ?? "updated the ticket"
  }
  return new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(parts)
}

export const ticketActivityAction = (
  envelope: EventEnvelope,
  context?: TicketActivityContext,
): string => {
  switch (envelope.event._tag) {
    case "ticket.created":
      return `created the ticket ${quote(envelope.event.title)}`
    case "ticket.moved": {
      const destination = columnLabel(envelope.event.columnId, context)
      if (envelope.event.previousColumnId === undefined) {
        return `moved the ticket to ${quote(destination)}`
      }
      const source = columnLabel(envelope.event.previousColumnId, context)
      return `moved the ticket from ${quote(source)} → ${quote(destination)}`
    }
    case "ticket.completed": {
      const from = columnLabel(envelope.event.previousColumnId, context)
      const to = columnLabel(envelope.event.doneColumnId, context)
      return `completed the ticket (${quote(from)} → ${quote(to)})`
    }
    case "ticket.reopened":
      return `reopened the ticket to ${quote(columnLabel(envelope.event.columnId, context))}`
    case "ticket.archived":
      return "archived the ticket"
    case "ticket.restored":
      return `restored the ticket to ${quote(columnLabel(envelope.event.columnId, context))}`
    case "ticket.assigned":
      return "changed the assignment"
    case "ticket.updated":
      return ticketUpdatedAction(envelope.event)
    case "ticket.dependency.added":
      return `added a dependency on ${quote(ticketLabel(envelope.event.dependsOnTicketId, context))}`
    case "ticket.dependency.removed":
      return `removed a dependency on ${quote(ticketLabel(envelope.event.dependsOnTicketId, context))}`
    case "ticket.thread.linked":
    case "ticket.thread.unlinked":
      return flattenTicketActivityParts(ticketActivityParts(envelope, context))
    case "kanbanColumn.created":
      return "created a column"
    case "kanbanColumn.updated":
      return "updated a column"
    case "kanbanColumn.moved":
      return "moved a column"
    case "kanbanColumn.deleted":
      return "deleted a column"
    default:
      return "recorded activity"
  }
}

export const ticketActivityParts = (
  envelope: EventEnvelope,
  context?: TicketActivityContext,
): ReadonlyArray<TicketActivityPart> => {
  switch (envelope.event._tag) {
    case "ticket.thread.linked":
      return threadActionParts("linked the ticket to ", envelope.event.threadId, context)
    case "ticket.thread.unlinked":
      return threadActionParts("unlinked ", envelope.event.threadId, context)
    default:
      return [{ kind: "text", text: ticketActivityAction(envelope, context) }]
  }
}

const AGENT_THREAD_PREFIX = "agent:thread:"
const LEGACY_AGENT_CURSOR_PREFIX = "agent:cursor:"

const actorThreadId = (actorId: string): string | undefined =>
  actorId.startsWith(AGENT_THREAD_PREFIX) ? actorId.slice(AGENT_THREAD_PREFIX.length) : undefined

/** Label d'affichage : humain local, thread agent, ou acteur technique. */
export const ticketActivityActor = (actorId: string, context?: TicketActivityContext): string => {
  if (actorId.startsWith("human:")) {
    return "You"
  }
  const threadId = actorThreadId(actorId)
  if (threadId !== undefined) {
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

export const ticketActivityActorThread = (
  actorId: string,
  context?: TicketActivityContext,
): TicketActivityThreadRef | undefined => {
  const threadId = actorThreadId(actorId)
  if (threadId === undefined) {
    return undefined
  }
  const thread = ticketActivityThreadRef(threadId, context)
  return thread.availability === "missing" ? undefined : thread
}

export const ticketActivityItem = (
  envelope: EventEnvelope,
  context?: TicketActivityContext,
): TicketActivityItem => {
  const actorThread = ticketActivityActorThread(envelope.actorId, context)
  const parts = ticketActivityParts(envelope, context)
  const item = {
    id: envelope.eventId,
    actor: ticketActivityActor(envelope.actorId, context),
    action: flattenTicketActivityParts(parts),
    parts,
    occurredAt: DateTime.formatIso(envelope.occurredAt),
  }
  if (actorThread === undefined) {
    return item
  }
  return { ...item, actorThread }
}
