import type { SessionStatus } from "@noyau/protocol/entities/session"
import type { LatestTurn } from "@noyau/protocol/entities/turn"
import type { ThreadId } from "@noyau/protocol/ids"
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

export const resolveThreadActivity = (input: {
  readonly sessionStatus: SessionStatus | null
  readonly latestTurn: LatestTurn | null
  readonly lastVisitedAtMs: number | undefined
}): ThreadActivity | null => {
  const { sessionStatus, latestTurn } = input
  if (sessionStatus === "error" || latestTurn?.state === "error") {
    return { kind: "error", label: "Erreur" }
  }
  if (isThreadWorking(sessionStatus, latestTurn)) {
    return { kind: "working", label: "En cours" }
  }
  if (latestTurn === null) {
    return null
  }
  const settlementKind =
    latestTurn.state === "interrupted"
      ? "interrupted"
      : latestTurn.state === "completed" ||
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
    return settlementKind === "interrupted"
      ? { kind: "interrupted", label: "Interrompu" }
      : { kind: "completed", label: "Terminé" }
  }
  return null
}

export const workingTranscriptLabel = (startedAtMs: number | null, nowMs: number): string => {
  if (startedAtMs === null) {
    return "En cours…"
  }
  return `En cours depuis ${formatElapsedLabel(nowMs - startedAtMs)}`
}

export const settledTranscriptLabel = (
  latestTurn: Pick<LatestTurn, "state" | "requestedAt" | "startedAt" | "completedAt"> | null,
): string | null => {
  if (latestTurn === null || latestTurn.completedAt === null) {
    return null
  }
  const startedAtMs = firstValidEpochMs(latestTurn.startedAt, latestTurn.requestedAt)
  const completedAtMs = epochMsOf(latestTurn.completedAt)
  const duration =
    startedAtMs === null || completedAtMs === null || completedAtMs < startedAtMs
      ? null
      : formatElapsedLabel(completedAtMs - startedAtMs)
  switch (latestTurn.state) {
    case "completed":
      return duration === null ? "A travaillé" : `A travaillé ${duration}`
    case "interrupted":
      return duration === null ? "Interrompu" : `Interrompu après ${duration}`
    case "error":
      return duration === null ? "Échec" : `Échec après ${duration}`
    case "running":
      return latestTurn.completedAt === null
        ? null
        : duration === null
          ? "A travaillé"
          : `A travaillé ${duration}`
  }
}
