import type { TranscriptItem, TranscriptUserInput } from "@noyau/contracts/entities/transcript"
import type { LatestTurn } from "@noyau/contracts/entities/turn"

/**
 * A request stays actionable until its transcript status changes. Restricting
 * it to the latest Turn prevents incomplete historical rows from resurfacing.
 */
export const actionableUserInputForLatestTurn = (input: {
  readonly transcript: ReadonlyArray<TranscriptItem>
  readonly latestTurn: Pick<LatestTurn, "turnId" | "state"> | null | undefined
}): TranscriptUserInput | undefined => {
  const latestTurn = input.latestTurn
  if (latestTurn === null || latestTurn === undefined) {
    return undefined
  }
  return input.transcript
    .toReversed()
    .find(
      (item): item is TranscriptUserInput =>
        item._tag === "transcript.user-input" &&
        (item.status === "pending" || item.status === "detached") &&
        item.turnId === latestTurn.turnId,
    )
}
