import type { SettledOverride } from "@noyau/contracts/entities/thread"
import type { VcsStatusPullRequestState } from "@noyau/contracts/git"
import type { ThreadShell } from "@noyau/contracts/shell"
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

export type ChangeRequestSettleSight = {
  readonly number: number
  readonly state: ChangeRequestStateLike
}

/** Persisté une fois par PR terminale ; le même merge ne se re-applique pas après une activité. */
export const changeRequestSettleDecision = (input: {
  readonly previous: ChangeRequestSettleSight | null
  readonly next: ChangeRequestSettleSight | null
  readonly autoSettleOnMerge: boolean
  readonly canSettle: boolean
  readonly settledOverride: SettledOverride | null
}): "persist" | "remember" | "retry" => {
  if (input.next === null) {
    return "remember"
  }
  if (input.settledOverride !== null) {
    return "remember"
  }
  if (!changeRequestAutoSettles(input.next.state, input.autoSettleOnMerge)) {
    return "remember"
  }
  const alreadyNoted =
    input.previous !== null &&
    input.previous.number === input.next.number &&
    changeRequestAutoSettles(input.previous.state, input.autoSettleOnMerge)
  if (alreadyNoted) {
    return "remember"
  }
  if (!input.canSettle) {
    return "retry"
  }
  return "persist"
}

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

/** Local shell patch after settle/unsettle is accepted. The live upsert replaces it. */
export const applyOptimisticThreadSettle = (
  thread: ThreadShell,
  nextSettled: boolean,
  at: DateTime.Utc = DateTime.nowUnsafe(),
): ThreadShell => {
  if (nextSettled) {
    return {
      ...thread,
      settledOverride: "settled",
      settledAt: thread.settledAt ?? at,
      updatedAt: at,
    }
  }
  const { settledAt: _settledAt, ...rest } = thread
  return {
    ...rest,
    settledOverride: "active",
    listedAt: at,
    updatedAt: at,
  }
}
