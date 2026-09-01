import type { ShellLiveEvent } from "@noyau/contracts/shell"

import { refreshThreadSnapshot } from "@/lib/thread-snapshot-prefetch"
import { requireTerminalThreadSnapshot } from "@/state/thread-snapshot"

/** Warm the body cache as soon as the lightweight shell reports a settled Turn. */
export const warmTerminalThreadSnapshot = (event: ShellLiveEvent): boolean => {
  if (event._tag !== "thread-upserted") {
    return false
  }
  if (!requireTerminalThreadSnapshot(event.thread, event.sequence)) {
    return false
  }
  refreshThreadSnapshot(event.thread.id)
  return true
}
