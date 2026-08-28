import type { LatestTurn } from "@noyau/contracts/entities/turn"
import type { ThreadId } from "@noyau/contracts/ids"

/** Prefer the loaded snapshot so an explicit `null` latestTurn is not lost to `??`. */
export const resolveDraftLatestTurn = (
  pageLatestTurn: LatestTurn | null | undefined,
  shellLatestTurn: LatestTurn | null | undefined,
  pageSnapshotLoaded: boolean,
): LatestTurn | null | undefined => (pageSnapshotLoaded ? pageLatestTurn : shellLatestTurn)

/** Empty persisted Thread, or the `/thread/new` route before the first send. */
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
