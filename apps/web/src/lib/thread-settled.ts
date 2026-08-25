import type { SettledOverride } from "@noyau/protocol/entities/thread"
import type { VcsStatusPullRequestState } from "@noyau/protocol/git"
import type { ThreadShell } from "@noyau/protocol/shell"
import { DateTime } from "effect"

import { epochMsOf } from "@/lib/thread-activity"

export type ChangeRequestStateLike = VcsStatusPullRequestState

export type ThreadSettleShell = Pick<
  ThreadShell,
  | "settledOverride"
  | "settledAt"
  | "sessionStatus"
  | "latestTurn"
  | "hasPendingApprovals"
  | "hasPendingUserInput"
>

const DAY_MS = 24 * 60 * 60 * 1_000

export const changeRequestAutoSettles = (
  state: ChangeRequestStateLike | null | undefined,
  autoSettleOnMerge = true,
): boolean => state === "closed" || (state === "merged" && autoSettleOnMerge)

export const threadLastActivityAtMs = (shell: ThreadSettleShell): number | null => {
  const turn = shell.latestTurn
  const candidates = [turn?.requestedAt, turn?.startedAt, turn?.completedAt]
  let latest = Number.NEGATIVE_INFINITY
  for (const candidate of candidates) {
    const ms = epochMsOf(candidate)
    if (ms !== null && ms > latest) {
      latest = ms
    }
  }
  return Number.isFinite(latest) && latest !== Number.NEGATIVE_INFINITY ? latest : null
}

export const canSettle = (shell: ThreadSettleShell): boolean => {
  if (shell.hasPendingApprovals === true || shell.hasPendingUserInput === true) {
    return false
  }
  if (shell.sessionStatus === "starting" || shell.sessionStatus === "running") {
    return false
  }
  if (shell.latestTurn?.state === "running") {
    return false
  }
  return true
}

export const effectiveSettled = (
  shell: ThreadSettleShell,
  options: {
    readonly nowMs: number
    readonly autoSettleAfterDays: number | null
    readonly autoSettleOnMerge?: boolean
    readonly changeRequestState?: ChangeRequestStateLike | null
  },
): boolean => {
  if (shell.hasPendingApprovals === true || shell.hasPendingUserInput === true) {
    return false
  }
  if (shell.sessionStatus === "starting" || shell.sessionStatus === "running") {
    return false
  }
  if (shell.latestTurn?.state === "running") {
    const serverAdjudicated =
      shell.settledOverride === "settled" &&
      shell.settledAt !== undefined &&
      shell.latestTurn.requestedAt !== undefined &&
      DateTime.toEpochMillis(shell.settledAt) >=
        DateTime.toEpochMillis(shell.latestTurn.requestedAt)
    if (!serverAdjudicated) {
      return false
    }
  }
  if (shell.settledOverride === "settled") {
    return true
  }
  if (shell.settledOverride === "active") {
    return false
  }
  if (changeRequestAutoSettles(options.changeRequestState, options.autoSettleOnMerge !== false)) {
    return true
  }
  if (options.changeRequestState === "open") {
    return false
  }
  if (options.autoSettleAfterDays === null) {
    return false
  }
  const lastActivityAtMs = threadLastActivityAtMs(shell)
  if (lastActivityAtMs === null) {
    return false
  }
  return lastActivityAtMs < options.nowMs - options.autoSettleAfterDays * DAY_MS
}

export const threadSettledOverrideOf = (
  thread: Pick<ThreadShell, "settledOverride">,
): SettledOverride | null => thread.settledOverride ?? null
