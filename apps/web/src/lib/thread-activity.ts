import type { SessionStatus } from "@noyau/contracts/entities/session"
import type { ThreadStatus } from "@noyau/contracts/entities/thread"
import type { LatestTurn } from "@noyau/contracts/entities/turn"
import type { ThreadId } from "@noyau/contracts/ids"
import { DateTime } from "effect"

export type ThreadActivityKind = "working" | "completed" | "interrupted" | "error"

export type ThreadActivity = {
  readonly kind: ThreadActivityKind
  readonly label: string
}

const busySessionStatuses = new Set<SessionStatus>(["starting", "running"])

export const epochMsOf = (value: DateTime.Utc | null | undefined): number | null => {
  if (value == null) {
    return null
  }
  const ms = DateTime.toEpochMillis(value)
  return Number.isFinite(ms) ? ms : null
}

export const firstValidEpochMs = (
  ...candidates: ReadonlyArray<DateTime.Utc | null | undefined>
): number | null => {
  for (const candidate of candidates) {
    const ms = epochMsOf(candidate)
    if (ms !== null) {
      return ms
    }
  }
  return null
}

export const isLatestTurnSettled = (latestTurn: Pick<LatestTurn, "completedAt"> | null): boolean =>
  latestTurn?.completedAt != null

export const isThreadWorking = (
  sessionStatus: SessionStatus | null,
  latestTurn: Pick<LatestTurn, "state" | "completedAt"> | null,
): boolean => {
  if (isLatestTurnSettled(latestTurn)) {
    return false
  }
  return (
    (sessionStatus !== null && busySessionStatuses.has(sessionStatus)) ||
    latestTurn?.state === "running"
  )
}

export const isOptimisticSendActive = (input: {
  readonly sendStartedAtMs: number | null
  readonly latestTurnCompletedAtMs: number | null
  readonly isAuthoritativeWorking: boolean
}): boolean => {
  if (input.sendStartedAtMs === null || input.isAuthoritativeWorking) {
    return false
  }
  return (
    input.latestTurnCompletedAtMs === null || input.latestTurnCompletedAtMs < input.sendStartedAtMs
  )
}

export const resolveWorkingStartedAtMs = (input: {
  readonly latestTurn: Pick<LatestTurn, "startedAt" | "requestedAt" | "completedAt"> | null
  readonly sendStartedAtMs?: number | null
}): number | null => {
  const turn = input.latestTurn
  if (turn !== null && turn.completedAt === null) {
    return firstValidEpochMs(turn.startedAt, turn.requestedAt)
  }
  return input.sendStartedAtMs ?? null
}

export type OptimisticSend = {
  readonly threadId: ThreadId | undefined
  readonly startedAtMs: number
}

const pendingOptimisticSends = new Map<ThreadId, OptimisticSend>()

/** Survit un remount draft → Thread. Sans ça, le composer draft revient après `onCreated`. */
export const rememberOptimisticSend = (send: OptimisticSend): void => {
  if (send.threadId === undefined) {
    return
  }
  pendingOptimisticSends.set(send.threadId, send)
}

export const peekOptimisticSend = (threadId: ThreadId | undefined): OptimisticSend | null => {
  if (threadId === undefined) {
    return null
  }
  return pendingOptimisticSends.get(threadId) ?? null
}

export const clearOptimisticSend = (threadId?: ThreadId): void => {
  if (threadId === undefined) {
    return
  }
  pendingOptimisticSends.delete(threadId)
}

export const sendStartedAtMsForThread = (
  send: OptimisticSend | null,
  threadId: ThreadId | undefined,
): number | null => {
  if (send === null || send.threadId !== threadId) {
    return null
  }
  return send.startedAtMs
}

export type OpenThreadWorking = {
  readonly isAuthoritativeWorking: boolean
  readonly isWorking: boolean
  readonly workingStartedAtMs: number | null
}

export const resolveOpenThreadWorking = (input: {
  readonly openThreadId: ThreadId | undefined
  readonly snapshotThreadId: ThreadId | undefined
  readonly sessionStatus: SessionStatus | null
  readonly latestTurn: LatestTurn | null
  readonly send: OptimisticSend | null
}): OpenThreadWorking => {
  const snapshotMatches = input.snapshotThreadId === input.openThreadId
  const latestTurn = snapshotMatches ? input.latestTurn : null
  const sessionStatus = snapshotMatches ? input.sessionStatus : null
  const sendStartedAtMs = sendStartedAtMsForThread(input.send, input.openThreadId)
  const isAuthoritativeWorking = isThreadWorking(sessionStatus, latestTurn)
  const isWorking =
    isAuthoritativeWorking ||
    isOptimisticSendActive({
      sendStartedAtMs,
      latestTurnCompletedAtMs: epochMsOf(latestTurn?.completedAt),
      isAuthoritativeWorking,
    })
  return {
    isAuthoritativeWorking,
    isWorking,
    workingStartedAtMs: isWorking
      ? resolveWorkingStartedAtMs({ latestTurn, sendStartedAtMs })
      : null,
  }
}

/**
 * Compact reverse-timer buckets for sidebar last-activity, aligned with
 * t3code's compact sidebar clock (`now` / `2m` / `3h` / `5d`).
 */
export const formatAgoCompactLabel = (elapsedMs: number): string => {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 5_000) {
    return "now"
  }
  if (elapsedMs < 60_000) {
    return `${String(Math.floor(elapsedMs / 1_000))}s`
  }
  const minutes = Math.floor(elapsedMs / 60_000)
  if (minutes < 60) {
    return `${String(minutes)}m`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${String(hours)}h`
  }
  return `${String(Math.floor(hours / 24))}d`
}

export const resolveSidebarLastActivityAtMs = (input: {
  readonly latestTurn: Pick<LatestTurn, "requestedAt" | "startedAt" | "completedAt"> | null
  readonly updatedAt: DateTime.Utc
  readonly createdAt: DateTime.Utc
}): number | null => {
  const candidates = [
    input.latestTurn?.completedAt,
    input.latestTurn?.startedAt,
    input.latestTurn?.requestedAt,
    input.updatedAt,
    input.createdAt,
  ]
  let latest = Number.NEGATIVE_INFINITY
  for (const candidate of candidates) {
    const ms = epochMsOf(candidate)
    if (ms !== null && ms > latest) {
      latest = ms
    }
  }
  return Number.isFinite(latest) && latest !== Number.NEGATIVE_INFINITY ? latest : null
}

/** Whole-second elapsed label for live and settled Turn timers. */
export const formatElapsedLabel = (elapsedMs: number): string => {
  const totalSeconds =
    !Number.isFinite(elapsedMs) || elapsedMs < 0 ? 0 : Math.floor(elapsedMs / 1_000)
  if (totalSeconds < 60) {
    return `${String(totalSeconds)}s`
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (seconds === 0) {
    return `${String(minutes)}m`
  }
  return `${String(minutes)}m ${String(seconds)}s`
}

export const hasUnseenCompletion = (input: {
  readonly completedAt: DateTime.Utc | null | undefined
  readonly lastVisitedAtMs: number | undefined
}): boolean => {
  const completedAtMs = epochMsOf(input.completedAt)
  if (completedAtMs === null) {
    return false
  }
  if (input.lastVisitedAtMs === undefined) {
    return false
  }
  if (!Number.isFinite(input.lastVisitedAtMs)) {
    return true
  }
  return completedAtMs > input.lastVisitedAtMs
}

/** Sidebar badge: In progress, unseen Done, or Error. A canceled Turn stays idle. */
export const resolveThreadActivity = (input: {
  readonly sessionStatus: SessionStatus | null
  readonly latestTurn: LatestTurn | null
  readonly lastVisitedAtMs: number | undefined
}): ThreadActivity | null => {
  const { sessionStatus, latestTurn } = input
  if (latestTurn?.state === "interrupted" || sessionStatus === "interrupted") {
    return null
  }
  if (sessionStatus === "error" || latestTurn?.state === "error") {
    return { kind: "error", label: "Error" }
  }
  if (isThreadWorking(sessionStatus, latestTurn)) {
    return { kind: "working", label: "In progress" }
  }
  if (latestTurn === null) {
    return null
  }
  const settlementKind =
    latestTurn.state === "completed" ||
    (latestTurn.state === "running" && latestTurn.completedAt != null)
      ? "completed"
      : null
  if (
    settlementKind !== null &&
    hasUnseenCompletion({
      completedAt: latestTurn.completedAt,
      lastVisitedAtMs: input.lastVisitedAtMs,
    })
  ) {
    return { kind: "completed", label: "Done" }
  }
  return null
}

export const isWaitingThreadActivity = (activity: ThreadActivity | null): boolean =>
  activity?.kind === "completed" || activity?.kind === "interrupted"

export const countWaitingThreads = (
  threads: ReadonlyArray<{
    readonly id: ThreadId
    readonly status: ThreadStatus
    readonly sessionStatus: SessionStatus | null
    readonly latestTurn: LatestTurn | null
  }>,
  lastVisitedAtMsOf: (threadId: ThreadId) => number | undefined,
): number => {
  let count = 0
  for (const thread of threads) {
    if (thread.status !== "active") {
      continue
    }
    if (
      isWaitingThreadActivity(
        resolveThreadActivity({
          sessionStatus: thread.sessionStatus,
          latestTurn: thread.latestTurn,
          lastVisitedAtMs: lastVisitedAtMsOf(thread.id),
        }),
      )
    ) {
      count += 1
    }
  }
  return count
}

export const settledTranscriptLabel = (
  latestTurn: Pick<LatestTurn, "state" | "requestedAt" | "startedAt" | "completedAt"> | null,
): string | null => {
  if (latestTurn === null || latestTurn.completedAt === null) {
    return null
  }
  if (latestTurn.state === "completed" || latestTurn.state === "running") {
    return null
  }
  const startedAtMs = firstValidEpochMs(latestTurn.startedAt, latestTurn.requestedAt)
  const completedAtMs = epochMsOf(latestTurn.completedAt)
  const duration =
    startedAtMs === null || completedAtMs === null || completedAtMs < startedAtMs
      ? null
      : formatElapsedLabel(completedAtMs - startedAtMs)
  switch (latestTurn.state) {
    case "interrupted":
      return duration === null ? "Interrupted" : `Interrupted after ${duration}`
    case "error":
      return duration === null ? "Failed" : `Failed after ${duration}`
  }
}
