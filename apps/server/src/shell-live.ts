import type { DomainEvent } from "@noyau/contracts/events"
import type { ThreadId } from "@noyau/contracts/ids"
import { ProjectEvent } from "@noyau/contracts/project/events"
import { ThreadEvent } from "@noyau/contracts/thread/events"
import { Schema } from "effect"

const isProjectEvent = Schema.is(ProjectEvent)
const isThreadEvent = Schema.is(ThreadEvent)

/** Sidebar / Discord n'ont pas besoin du texte, des tools ni du plan. */
export const threadEventTouchesShell = (event: ThreadEvent): boolean => {
  if (event._tag !== "thread.transcript-appended") {
    return true
  }
  return event.item._tag === "transcript.permission" || event.item._tag === "transcript.user-input"
}

export const threadIdOf = (event: ThreadEvent): ThreadId =>
  event._tag === "thread.transcript-appended" ? event.item.threadId : event.threadId

export const shellAggregateKey = (event: DomainEvent): string | undefined => {
  if (isProjectEvent(event)) {
    return `project:${event.projectId}`
  }
  if (isThreadEvent(event) && threadEventTouchesShell(event)) {
    return `thread:${threadIdOf(event)}`
  }
  return undefined
}

export const coalescePersistedForShell = <
  Event extends { readonly sequence: number; readonly event: DomainEvent },
>(
  events: ReadonlyArray<Event>,
): ReadonlyArray<Event> => {
  const latest = new Map<string, Event>()
  for (const persisted of events) {
    const key = shellAggregateKey(persisted.event)
    if (key === undefined) {
      continue
    }
    latest.set(key, persisted)
  }
  return [...latest.values()].toSorted((left, right) => left.sequence - right.sequence)
}
