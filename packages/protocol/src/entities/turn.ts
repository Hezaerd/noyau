import { ThreadId, TurnId } from "@noyau/protocol/ids"
import { Schema } from "effect"

export const TurnState = Schema.Literals(["running", "interrupted", "completed", "error"])
export type TurnState = (typeof TurnState)["Type"]

export const TurnSettlementState = Schema.Literals(["interrupted", "completed", "error"])
export type TurnSettlementState = (typeof TurnSettlementState)["Type"]

export const LatestTurn = Schema.Struct({
  turnId: TurnId,
  state: TurnState,
  requestedAt: Schema.DateTimeUtcFromString,
  startedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  completedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
})
export type LatestTurn = (typeof LatestTurn)["Type"]

/** Cycle utilisateur→agent append-only. */
export const Turn = Schema.Struct({
  id: TurnId,
  threadId: ThreadId,
  ordinal: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  state: TurnState,
  requestedAt: Schema.DateTimeUtcFromString,
  startedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  completedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
})
export type Turn = (typeof Turn)["Type"]
