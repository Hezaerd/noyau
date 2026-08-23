import type { SessionStatus } from "@noyau/protocol/entities/session"
import type { LatestTurn } from "@noyau/protocol/entities/turn"
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

export const isThreadWorking = (
  sessionStatus: SessionStatus | null,
  latestTurn: Pick<LatestTurn, "state"> | null,
): boolean =>
  (sessionStatus !== null && busySessionStatuses.has(sessionStatus)) ||
  latestTurn?.state === "running"

export const resolveWorkingStartedAtMs = (input: {
  readonly latestTurn: Pick<LatestTurn, "startedAt" | "requestedAt" | "completedAt"> | null
  readonly updatedAt?: DateTime.Utc | undefined
}): number | null => {
  const turn = input.latestTurn
  if (turn !== null && turn.completedAt === null) {
    return firstValidEpochMs(turn.startedAt, turn.requestedAt)
  }
  return firstValidEpochMs(input.updatedAt)
}

export const formatElapsedLabel = (elapsedMs: number): string => {
  const seconds = Number.isFinite(elapsedMs) ? Math.max(0, Math.floor(elapsedMs / 1000)) : 0
  if (seconds < 60) {
    return `${String(seconds)}s`
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    const remainder = seconds % 60
    return remainder === 0 ? `${String(minutes)}m` : `${String(minutes)}m ${String(remainder)}s`
  }
  const hours = Math.floor(minutes / 60)
  const remainderMinutes = minutes % 60
  return remainderMinutes === 0
    ? `${String(hours)}h`
    : `${String(hours)}h ${String(remainderMinutes)}m`
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
  if (
    latestTurn?.state === "interrupted" &&
    hasUnseenCompletion({
      completedAt: latestTurn.completedAt,
      lastVisitedAtMs: input.lastVisitedAtMs,
    })
  ) {
    return { kind: "interrupted", label: "Interrompu" }
  }
  if (
    latestTurn?.state === "completed" &&
    hasUnseenCompletion({
      completedAt: latestTurn.completedAt,
      lastVisitedAtMs: input.lastVisitedAtMs,
    })
  ) {
    return { kind: "completed", label: "Terminé" }
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
  latestTurn: Pick<LatestTurn, "state" | "startedAt" | "completedAt"> | null,
): string | null => {
  if (latestTurn === null || latestTurn.completedAt === null) {
    return null
  }
  const startedAtMs = firstValidEpochMs(latestTurn.startedAt)
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
      return null
  }
}

export const deriveActiveWorkStartedAtMs = (input: {
  readonly latestTurn: Pick<LatestTurn, "startedAt" | "requestedAt" | "completedAt"> | null
  readonly updatedAt?: DateTime.Utc | undefined
  readonly sendStartedAtMs: number | null
}): number | null => {
  if (input.latestTurn !== null && input.latestTurn.completedAt === null) {
    return firstValidEpochMs(input.latestTurn.startedAt, input.latestTurn.requestedAt)
  }
  return input.sendStartedAtMs
}
