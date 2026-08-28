import {
  type CheckpointRef,
  checkpointRefForTurn,
  type Turn,
  type TurnDiffFile,
  type TurnDiffStatus,
  type TurnSettlementState,
} from "@noyau/contracts/entities/turn"
import type { ThreadId, TurnId } from "@noyau/contracts/ids"
import type { TurnDiffUnavailableReason } from "@noyau/contracts/turn-diff"

const destinationPath = (rawPath: string): string => {
  const braced = /^(.*)\{(.*?) => (.*?)\}(.*)$/.exec(rawPath)
  if (braced !== null) {
    return `${braced[1] ?? ""}${braced[3] ?? ""}${braced[4] ?? ""}`
  }
  return rawPath.includes(" => ") ? (rawPath.split(" => ").at(-1) ?? rawPath) : rawPath
}

const kindFromNameStatus = (status: string): string | undefined => {
  switch (status.charAt(0)) {
    case "A":
      return "added"
    case "D":
      return "deleted"
    case "M":
    case "T":
    case "C":
      return "modified"
    default:
      return undefined
  }
}

export const parseTurnDiffNumstat = (stdout: string): ReadonlyArray<TurnDiffFile> => {
  const kinds = new Map<string, string>()
  const stats: Array<{ path: string; additions: number; deletions: number }> = []
  for (const line of stdout.split(/\r?\n/g)) {
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      continue
    }
    const numstat = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(trimmed)
    if (numstat !== null) {
      const path = destinationPath(numstat[3] ?? "")
      if (path.length === 0) {
        continue
      }
      stats.push({
        path,
        additions: numstat[1] === "-" ? 0 : Number(numstat[1]),
        deletions: numstat[2] === "-" ? 0 : Number(numstat[2]),
      })
      continue
    }
    const nameStatus = /^([A-Z])\d*(?:\t(.+))?$/.exec(trimmed)
    if (nameStatus === null) {
      continue
    }
    const kind = kindFromNameStatus(nameStatus[1] ?? "")
    const rawPath = nameStatus[2] ?? ""
    const path = rawPath.includes("\t")
      ? destinationPath(rawPath.split("\t").at(-1) ?? rawPath)
      : destinationPath(rawPath)
    if (kind === undefined || path.length === 0) {
      continue
    }
    kinds.set(path, kind)
  }
  return stats.map((file) => ({
    path: file.path,
    kind: kinds.get(file.path) ?? "modified",
    additions: file.additions,
    deletions: file.deletions,
  }))
}

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
