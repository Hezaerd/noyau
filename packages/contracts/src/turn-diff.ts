import { CheckpointRef } from "@noyau/contracts/entities/turn"
import { ThreadId, TurnId } from "@noyau/contracts/ids"
import { Schema } from "effect"

export const TurnDiffUnavailableReason = Schema.Literals([
  "turn-not-found",
  "not-captured",
  "checkpoint-missing",
])
export type TurnDiffUnavailableReason = (typeof TurnDiffUnavailableReason)["Type"]

/** Lecture RPC du patch unifié entre deux Checkpoints. Pas une Command. */
export class TurnDiffUnavailable extends Schema.TaggedError<TurnDiffUnavailable>()(
  "TurnDiffUnavailable",
  {
    threadId: ThreadId,
    turnId: TurnId,
    reason: TurnDiffUnavailableReason,
  },
) {}

export const GetTurnDiffInput = Schema.Struct({
  threadId: ThreadId,
  turnId: TurnId,
  ignoreWhitespace: Schema.optionalKey(Schema.Boolean),
})
export type GetTurnDiffInput = (typeof GetTurnDiffInput)["Type"]

export const TurnDiffPatch = Schema.Struct({
  threadId: ThreadId,
  turnId: TurnId,
  checkpointRef: CheckpointRef,
  patch: Schema.String,
})
export type TurnDiffPatch = (typeof TurnDiffPatch)["Type"]
