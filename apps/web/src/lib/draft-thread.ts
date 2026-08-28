import type { LatestTurn } from "@noyau/contracts/entities/turn"
import type { ThreadId } from "@noyau/contracts/ids"

/** Empty persisted Thread, or the `/thread/new` route before create finishes. */
export const isDraftThreadView = (input: {
  readonly threadId: ThreadId | undefined
  readonly latestTurn: LatestTurn | null | undefined
  readonly transcriptLength: number
  readonly sending: boolean
}): boolean => {
  if (input.sending) {
    return false
  }
  if (input.threadId === undefined) {
    return true
  }
  if (input.latestTurn === undefined) {
    return false
  }
  return input.latestTurn === null && input.transcriptLength === 0
}
