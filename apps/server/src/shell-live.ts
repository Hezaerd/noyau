import type { ThreadEvent } from "@noyau/protocol/thread/events"

/** Sidebar / Discord n'ont pas besoin du texte, des tools ni du plan. */
export const threadEventTouchesShell = (event: ThreadEvent): boolean => {
  if (event._tag !== "thread.transcript-appended") {
    return true
  }
  return event.item._tag === "transcript.permission" || event.item._tag === "transcript.user-input"
}
