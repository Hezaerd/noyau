import {
  type CheckpointRef,
  checkpointRefForTurn,
  type Turn,
  type TurnDiffFile,
  type TurnDiffStatus,
  type TurnSettlementState,
} from "@noyau/protocol/entities/turn"
import type { ThreadId, TurnId } from "@noyau/protocol/ids"
import type { TurnDiffUnavailableReason } from "@noyau/protocol/turn-diff"

export const parseTurnDiffNumstat = (stdout: string): ReadonlyArray<TurnDiffFile> =>
  stdout.split(/\r?\n/g).flatMap((line) => {
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      return []
    }
    const match = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(trimmed)
    if (match === null) {
      return []
    }
    const rawPath = match[3] ?? ""
    const path = rawPath.includes(" => ") ? (rawPath.split(" => ").at(-1) ?? rawPath) : rawPath
    if (path.length === 0) {
      return []
    }
    return [
      {
        path,
        kind: "modified",
        additions: match[1] === "-" ? 0 : Number(match[1]),
        deletions: match[2] === "-" ? 0 : Number(match[2]),
      },
    ]
  })

export const turnDiffStatusFromSettlement = (state: TurnSettlementState): TurnDiffStatus => {
  switch (state) {
    case "completed":
      return "ready"
    case "interrupted":
      return "missing"
    case "error":
      return "error"
  }
}

export const shouldCaptureBaselineOnTurnStarted = (input: {
  readonly prepareWorktree: boolean
  readonly worktreePath: string | null
}): boolean => !input.prepareWorktree || input.worktreePath !== null

export type ResolvedTurnDiffCheckpoints =
  | {
      readonly _tag: "ok"
      readonly from: CheckpointRef
      readonly to: CheckpointRef
    }
  | { readonly _tag: "unavailable"; readonly reason: TurnDiffUnavailableReason }

export const resolveTurnDiffCheckpoints = (input: {
  readonly threadId: ThreadId
  readonly turnId: TurnId
  readonly turns: ReadonlyArray<Turn>
}): ResolvedTurnDiffCheckpoints => {
  const turn = input.turns.find((candidate) => candidate.id === input.turnId)
  if (turn === undefined) {
    return { _tag: "unavailable", reason: "turn-not-found" }
  }
  if (turn.turnDiff === undefined) {
    return { _tag: "unavailable", reason: "not-captured" }
  }
  return {
    _tag: "ok",
    from: checkpointRefForTurn(input.threadId, turn.ordinal - 1),
    to: turn.turnDiff.checkpointRef,
  }
}
