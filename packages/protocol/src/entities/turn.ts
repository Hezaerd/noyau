import { ThreadId, TurnId } from "@noyau/protocol/ids"
import { Schema } from "effect"

export const TurnState = Schema.Literals(["running", "interrupted", "completed", "error"])
export type TurnState = (typeof TurnState)["Type"]

export const TurnSettlementState = Schema.Literals(["interrupted", "completed", "error"])
export type TurnSettlementState = (typeof TurnSettlementState)["Type"]

const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

/** Ref git cachée `refs/noyau/checkpoint/<threadId>/<ordinal>`. */
export const CheckpointRef = Schema.TemplateLiteral([
  "refs/noyau/checkpoint/",
  Schema.String.check(Schema.isUUID()),
  "/",
  Schema.String.check(Schema.isPattern(/^\d+$/)),
]).pipe(Schema.brand("CheckpointRef"))
export type CheckpointRef = (typeof CheckpointRef)["Type"]

export const checkpointRefForTurn = (threadId: ThreadId, ordinal: number): CheckpointRef =>
  CheckpointRef.make(`refs/noyau/checkpoint/${threadId}/${ordinal}`)

export const TurnDiffStatus = Schema.Literals(["ready", "missing", "error"])
export type TurnDiffStatus = (typeof TurnDiffStatus)["Type"]

export const TurnDiffFile = Schema.Struct({
  path: Schema.NonEmptyString,
  kind: Schema.NonEmptyString,
  additions: NonNegativeInt,
  deletions: NonNegativeInt,
})
export type TurnDiffFile = (typeof TurnDiffFile)["Type"]

export const TurnDiff = Schema.Struct({
  checkpointRef: CheckpointRef,
  status: TurnDiffStatus,
  files: Schema.Array(TurnDiffFile),
})
export type TurnDiff = (typeof TurnDiff)["Type"]

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
  turnDiff: Schema.optionalKey(TurnDiff),
})
export type Turn = (typeof Turn)["Type"]
