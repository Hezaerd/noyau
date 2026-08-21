import type { CursorProviderStatus } from "@noyau/protocol/entities/environment"

export const CURSOR_READINESS_KINDS = [
  "unknown",
  "ready",
  "not-installed",
  "handshake-failed",
] as const

export type CursorReadiness = (typeof CURSOR_READINESS_KINDS)[number]

export const resolveCursorReadiness = (
  status: CursorProviderStatus | undefined,
): CursorReadiness => {
  if (status === undefined) {
    return "unknown"
  }
  if (!status.installed) {
    return "not-installed"
  }
  if (!status.handshakeOk) {
    return "handshake-failed"
  }
  return "ready"
}

export const isCursorReady = (status: CursorProviderStatus | undefined): boolean =>
  resolveCursorReadiness(status) === "ready"
