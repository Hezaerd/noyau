import { LatestTurn } from "@noyau/protocol/entities/turn"
import { TurnId } from "@noyau/protocol/ids"
import { Schema } from "effect"
import { describe, expect, it } from "vite-plus/test"

import {
  deriveActiveWorkStartedAtMs,
  formatElapsedLabel,
  hasUnseenCompletion,
  isOptimisticSendActive,
  isThreadWorking,
  resolveThreadActivity,
  resolveWorkingStartedAtMs,
  settledTranscriptLabel,
  workingTranscriptLabel,
} from "../src/lib/thread-activity"

const turnId = TurnId.make("40000000-0000-4000-8000-000000000001")

const latestTurn = (input: {
  readonly state: LatestTurn["state"]
  readonly requestedAt?: string
  readonly startedAt?: string | null
  readonly completedAt?: string | null
}): LatestTurn =>
  Schema.decodeSync(LatestTurn)({
    turnId,
    state: input.state,
    requestedAt: input.requestedAt ?? "2026-08-23T12:00:00.000Z",
    startedAt: input.startedAt === undefined ? "2026-08-23T12:00:00.100Z" : input.startedAt,
    completedAt: input.completedAt === undefined ? null : input.completedAt,
  })

describe("thread activity", () => {
  it("treats a starting or running session as working even without a Turn", () => {
    expect(isThreadWorking("starting", null)).toBe(true)
    expect(isThreadWorking("running", null)).toBe(true)
    expect(isThreadWorking("ready", latestTurn({ state: "running" }))).toBe(true)
    expect(
      isThreadWorking(
        "ready",
        latestTurn({ state: "completed", completedAt: "2026-08-23T12:01:00.000Z" }),
      ),
    ).toBe(false)
    expect(
      isThreadWorking(
        "running",
        latestTurn({ state: "completed", completedAt: "2026-08-23T12:01:00.000Z" }),
      ),
    ).toBe(false)
    expect(
      isThreadWorking(
        "starting",
        latestTurn({ state: "completed", completedAt: "2026-08-23T12:01:00.000Z" }),
      ),
    ).toBe(false)
  })

  it("counts elapsed from startedAt, then requestedAt, while the Turn is open", () => {
    expect(
      resolveWorkingStartedAtMs({
        latestTurn: latestTurn({ state: "running", startedAt: "2026-08-23T12:00:05.000Z" }),
      }),
    ).toBe(Date.parse("2026-08-23T12:00:05.000Z"))
    expect(
      resolveWorkingStartedAtMs({
        latestTurn: latestTurn({ state: "running", startedAt: null }),
      }),
    ).toBe(Date.parse("2026-08-23T12:00:00.000Z"))
    expect(
      resolveWorkingStartedAtMs({
        latestTurn: latestTurn({
          state: "completed",
          completedAt: "2026-08-23T12:01:00.000Z",
        }),
        updatedAt: latestTurn({ state: "running" }).requestedAt,
      }),
    ).toBeNull()
  })

  it("formats compact elapsed labels", () => {
    expect(formatElapsedLabel(0)).toBe("0s")
    expect(formatElapsedLabel(42_000)).toBe("42s")
    expect(formatElapsedLabel(5 * 60_000)).toBe("5m")
    expect(formatElapsedLabel(5 * 60_000 + 12_000)).toBe("5m 12s")
    expect(formatElapsedLabel(90 * 60_000)).toBe("1h 30m")
    expect(formatElapsedLabel(Number.NaN)).toBe("0s")
    expect(formatElapsedLabel(-5_000)).toBe("0s")
  })

  it("hides historical completions until the Thread has been visited", () => {
    const completed = latestTurn({
      state: "completed",
      completedAt: "2026-08-23T12:05:00.000Z",
    })
    expect(
      hasUnseenCompletion({
        completedAt: completed.completedAt,
        lastVisitedAtMs: undefined,
      }),
    ).toBe(false)
    expect(
      hasUnseenCompletion({
        completedAt: completed.completedAt,
        lastVisitedAtMs: Date.parse("2026-08-23T12:04:00.000Z"),
      }),
    ).toBe(true)
    expect(
      hasUnseenCompletion({
        completedAt: completed.completedAt,
        lastVisitedAtMs: Date.parse("2026-08-23T12:05:00.000Z"),
      }),
    ).toBe(false)
  })

  it("resolves sidebar activity in error, working, then unseen settlement order", () => {
    expect(
      resolveThreadActivity({
        sessionStatus: "error",
        latestTurn: latestTurn({ state: "running" }),
        lastVisitedAtMs: undefined,
      }),
    ).toEqual({ kind: "error", label: "Erreur" })
    expect(
      resolveThreadActivity({
        sessionStatus: "running",
        latestTurn: latestTurn({ state: "running" }),
        lastVisitedAtMs: undefined,
      }),
    ).toEqual({ kind: "working", label: "En cours" })
    expect(
      resolveThreadActivity({
        sessionStatus: "ready",
        latestTurn: latestTurn({
          state: "completed",
          completedAt: "2026-08-23T12:05:00.000Z",
        }),
        lastVisitedAtMs: Date.parse("2026-08-23T12:00:00.000Z"),
      }),
    ).toEqual({ kind: "completed", label: "Terminé" })
    expect(
      resolveThreadActivity({
        sessionStatus: "ready",
        latestTurn: latestTurn({
          state: "interrupted",
          completedAt: "2026-08-23T12:05:00.000Z",
        }),
        lastVisitedAtMs: Date.parse("2026-08-23T12:00:00.000Z"),
      }),
    ).toEqual({ kind: "interrupted", label: "Interrompu" })
    expect(
      resolveThreadActivity({
        sessionStatus: "ready",
        latestTurn: latestTurn({
          state: "completed",
          completedAt: "2026-08-23T12:05:00.000Z",
        }),
        lastVisitedAtMs: undefined,
      }),
    ).toBeNull()
    expect(
      resolveThreadActivity({
        sessionStatus: "running",
        latestTurn: latestTurn({
          state: "completed",
          completedAt: "2026-08-23T12:05:00.000Z",
        }),
        lastVisitedAtMs: Date.parse("2026-08-23T12:00:00.000Z"),
      }),
    ).toEqual({ kind: "completed", label: "Terminé" })
  })

  it("drops the optimistic send once the Turn that started after it has settled", () => {
    expect(
      isOptimisticSendActive({
        sendStartedAtMs: Date.parse("2026-08-23T12:00:00.000Z"),
        latestTurnCompletedAtMs: Date.parse("2026-08-23T11:59:00.000Z"),
        isAuthoritativeWorking: false,
      }),
    ).toBe(true)
    expect(
      isOptimisticSendActive({
        sendStartedAtMs: Date.parse("2026-08-23T12:00:00.000Z"),
        latestTurnCompletedAtMs: Date.parse("2026-08-23T12:01:00.000Z"),
        isAuthoritativeWorking: false,
      }),
    ).toBe(false)
    expect(
      isOptimisticSendActive({
        sendStartedAtMs: Date.parse("2026-08-23T12:00:00.000Z"),
        latestTurnCompletedAtMs: null,
        isAuthoritativeWorking: true,
      }),
    ).toBe(false)
  })

  it("labels the live and settled transcript rows", () => {
    expect(workingTranscriptLabel(null, 0)).toBe("En cours…")
    expect(
      workingTranscriptLabel(
        Date.parse("2026-08-23T12:00:00.000Z"),
        Date.parse("2026-08-23T12:00:12.000Z"),
      ),
    ).toBe("En cours depuis 12s")
    expect(
      settledTranscriptLabel(
        latestTurn({
          state: "completed",
          startedAt: "2026-08-23T12:00:00.000Z",
          completedAt: "2026-08-23T12:01:23.000Z",
        }),
      ),
    ).toBe("A travaillé 1m 23s")
    expect(
      settledTranscriptLabel(
        latestTurn({
          state: "interrupted",
          startedAt: "2026-08-23T12:00:00.000Z",
          completedAt: "2026-08-23T12:00:08.000Z",
        }),
      ),
    ).toBe("Interrompu après 8s")
    expect(settledTranscriptLabel(latestTurn({ state: "running" }))).toBeNull()
    expect(
      settledTranscriptLabel(
        latestTurn({
          state: "running",
          startedAt: "2026-08-23T12:00:00.000Z",
          completedAt: "2026-08-23T12:00:08.000Z",
        }),
      ),
    ).toBe("A travaillé 8s")
  })

  it("keeps the local send timestamp until the open Turn has its own start", () => {
    expect(
      deriveActiveWorkStartedAtMs({
        latestTurn: latestTurn({
          state: "completed",
          completedAt: "2026-08-23T12:01:00.000Z",
        }),
        sendStartedAtMs: 1_000,
      }),
    ).toBe(1_000)
    expect(
      deriveActiveWorkStartedAtMs({
        latestTurn: latestTurn({ state: "running", startedAt: "2026-08-23T12:00:05.000Z" }),
        sendStartedAtMs: 1_000,
      }),
    ).toBe(Date.parse("2026-08-23T12:00:05.000Z"))
  })
})
