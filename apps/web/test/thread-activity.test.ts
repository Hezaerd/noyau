import { LatestTurn } from "@noyau/contracts/entities/turn"
import { ThreadId, TurnId } from "@noyau/contracts/ids"
import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import {
  clearOptimisticSend,
  formatAgoCompactLabel,
  formatElapsedLabel,
  hasUnseenCompletion,
  isOptimisticSendActive,
  isThreadWorking,
  peekOptimisticSend,
  rememberOptimisticSend,
  resolveOpenThreadWorking,
  resolveSidebarLastActivityAtMs,
  resolveThreadActivity,
  resolveWorkingStartedAtMs,
  sendStartedAtMsForThread,
  settledTranscriptLabel,
} from "../src/lib/thread-activity"

const turnId = TurnId.make("40000000-0000-4000-8000-000000000001")
const openThreadId = ThreadId.make("10000000-0000-4000-8000-000000000001")
const otherThreadId = ThreadId.make("20000000-0000-4000-8000-000000000002")

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

  it("counts elapsed from startedAt, then requestedAt, like t3code", () => {
    expect(
      resolveWorkingStartedAtMs({
        latestTurn: latestTurn({
          state: "running",
          requestedAt: "2026-08-23T12:00:00.000Z",
          startedAt: "2026-08-23T12:00:15.000Z",
        }),
      }),
    ).toBe(Date.parse("2026-08-23T12:00:15.000Z"))
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
        sendStartedAtMs: Date.parse("2026-08-23T12:00:00.000Z"),
      }),
    ).toBe(Date.parse("2026-08-23T12:00:00.000Z"))
    expect(
      resolveWorkingStartedAtMs({
        latestTurn: latestTurn({
          state: "completed",
          completedAt: "2026-08-23T12:01:00.000Z",
        }),
      }),
    ).toBeNull()
  })

  it("formats elapsed in whole seconds", () => {
    expect(formatElapsedLabel(0)).toBe("0s")
    expect(formatElapsedLabel(1)).toBe("0s")
    expect(formatElapsedLabel(871)).toBe("0s")
    expect(formatElapsedLabel(4_200)).toBe("4s")
    expect(formatElapsedLabel(9_950)).toBe("9s")
    expect(formatElapsedLabel(42_000)).toBe("42s")
    expect(formatElapsedLabel(5 * 60_000)).toBe("5m")
    expect(formatElapsedLabel(5 * 60_000 + 12_000)).toBe("5m 12s")
    expect(formatElapsedLabel(90 * 60_000)).toBe("90m")
    expect(formatElapsedLabel(Number.NaN)).toBe("0s")
    expect(formatElapsedLabel(-5_000)).toBe("0s")
  })

  it("formats a compact reverse timer for sidebar last-activity", () => {
    expect(formatAgoCompactLabel(0)).toBe("now")
    expect(formatAgoCompactLabel(4_999)).toBe("now")
    expect(formatAgoCompactLabel(5_000)).toBe("5s")
    expect(formatAgoCompactLabel(42_000)).toBe("42s")
    expect(formatAgoCompactLabel(5 * 60_000)).toBe("5m")
    expect(formatAgoCompactLabel(3 * 60 * 60_000)).toBe("3h")
    expect(formatAgoCompactLabel(5 * 24 * 60 * 60_000)).toBe("5d")
    expect(formatAgoCompactLabel(Number.NaN)).toBe("now")
    expect(formatAgoCompactLabel(-5_000)).toBe("now")
  })

  it("picks the latest turn or shell clock for sidebar last-activity", () => {
    const createdAt = Schema.decodeSync(Schema.DateTimeUtcFromString)("2026-08-20T12:00:00.000Z")
    const updatedAt = Schema.decodeSync(Schema.DateTimeUtcFromString)("2026-08-23T11:00:00.000Z")
    expect(
      resolveSidebarLastActivityAtMs({
        latestTurn: null,
        updatedAt,
        createdAt,
      }),
    ).toBe(Date.parse("2026-08-23T11:00:00.000Z"))
    expect(
      resolveSidebarLastActivityAtMs({
        latestTurn: latestTurn({
          state: "completed",
          completedAt: "2026-08-23T12:05:00.000Z",
        }),
        updatedAt,
        createdAt,
      }),
    ).toBe(Date.parse("2026-08-23T12:05:00.000Z"))
  })

  it("treats a completed Turn as unread until the Thread is visited", () => {
    const completed = latestTurn({
      state: "completed",
      completedAt: "2026-08-23T12:05:00.000Z",
    })
    expect(
      hasUnseenCompletion({
        completedAt: completed.completedAt,
        lastVisitedAtMs: undefined,
      }),
    ).toBe(true)
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
    ).toEqual({ kind: "error", label: "Error" })
    expect(
      resolveThreadActivity({
        sessionStatus: "running",
        latestTurn: latestTurn({ state: "running" }),
        lastVisitedAtMs: undefined,
      }),
    ).toEqual({ kind: "working", label: "In progress" })
    expect(
      resolveThreadActivity({
        sessionStatus: "ready",
        latestTurn: latestTurn({
          state: "completed",
          completedAt: "2026-08-23T12:05:00.000Z",
        }),
        lastVisitedAtMs: Date.parse("2026-08-23T12:00:00.000Z"),
      }),
    ).toEqual({ kind: "completed", label: "Done" })
    expect(
      resolveThreadActivity({
        sessionStatus: "ready",
        latestTurn: latestTurn({
          state: "interrupted",
          completedAt: "2026-08-23T12:05:00.000Z",
        }),
        lastVisitedAtMs: Date.parse("2026-08-23T12:00:00.000Z"),
      }),
    ).toBeNull()
    expect(
      resolveThreadActivity({
        sessionStatus: "error",
        latestTurn: latestTurn({
          state: "interrupted",
          completedAt: "2026-08-23T12:05:00.000Z",
        }),
        lastVisitedAtMs: Date.parse("2026-08-23T12:00:00.000Z"),
      }),
    ).toBeNull()
    expect(
      resolveThreadActivity({
        sessionStatus: "interrupted",
        latestTurn: latestTurn({
          state: "error",
          completedAt: "2026-08-23T12:05:00.000Z",
        }),
        lastVisitedAtMs: Date.parse("2026-08-23T12:00:00.000Z"),
      }),
    ).toBeNull()
    expect(
      resolveThreadActivity({
        sessionStatus: "ready",
        latestTurn: latestTurn({
          state: "completed",
          completedAt: "2026-08-23T12:05:00.000Z",
        }),
        lastVisitedAtMs: undefined,
      }),
    ).toEqual({ kind: "completed", label: "Done" })
    expect(
      resolveThreadActivity({
        sessionStatus: "running",
        latestTurn: latestTurn({
          state: "completed",
          completedAt: "2026-08-23T12:05:00.000Z",
        }),
        lastVisitedAtMs: Date.parse("2026-08-23T12:00:00.000Z"),
      }),
    ).toEqual({ kind: "completed", label: "Done" })
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

  it("labels settled transcript rows", () => {
    expect(
      settledTranscriptLabel(
        latestTurn({
          state: "completed",
          startedAt: "2026-08-23T12:00:00.000Z",
          completedAt: "2026-08-23T12:01:23.000Z",
        }),
      ),
    ).toBeNull()
    expect(
      settledTranscriptLabel(
        latestTurn({
          state: "interrupted",
          startedAt: "2026-08-23T12:00:00.000Z",
          completedAt: "2026-08-23T12:00:08.000Z",
        }),
      ),
    ).toBe("Interrupted after 8s")
    expect(settledTranscriptLabel(latestTurn({ state: "running" }))).toBeNull()
    expect(
      settledTranscriptLabel(
        latestTurn({
          state: "running",
          startedAt: "2026-08-23T12:00:00.000Z",
          completedAt: "2026-08-23T12:00:08.000Z",
        }),
      ),
    ).toBeNull()
    expect(
      settledTranscriptLabel(
        latestTurn({
          state: "completed",
          requestedAt: "2026-08-23T12:00:00.000Z",
          startedAt: "2026-08-23T12:00:15.000Z",
          completedAt: "2026-08-23T12:01:34.000Z",
        }),
      ),
    ).toBeNull()
    expect(
      settledTranscriptLabel(
        latestTurn({
          state: "error",
          startedAt: "2026-08-23T12:00:00.000Z",
          completedAt: "2026-08-23T12:00:08.000Z",
        }),
      ),
    ).toBe("Failed after 8s")
  })

  it("ignores an optimistic send that belongs to another Thread", () => {
    expect(
      sendStartedAtMsForThread({ threadId: otherThreadId, startedAtMs: 1_000 }, openThreadId),
    ).toBeNull()
    expect(
      sendStartedAtMsForThread({ threadId: openThreadId, startedAtMs: 1_000 }, openThreadId),
    ).toBe(1_000)
    expect(sendStartedAtMsForThread({ threadId: undefined, startedAtMs: 1_000 }, undefined)).toBe(
      1_000,
    )
  })

  it("does not show the running Thread timer on a different open Thread", () => {
    const running = latestTurn({
      state: "running",
      startedAt: "2026-08-23T12:00:00.000Z",
    })
    const settled = latestTurn({
      state: "completed",
      completedAt: "2026-08-23T11:00:00.000Z",
    })
    const leakedSend = {
      threadId: otherThreadId,
      startedAtMs: Date.parse("2026-08-23T12:00:00.000Z"),
    }
    expect(
      resolveOpenThreadWorking({
        openThreadId,
        snapshotThreadId: openThreadId,
        sessionStatus: "ready",
        latestTurn: settled,
        send: leakedSend,
      }),
    ).toEqual({
      isAuthoritativeWorking: false,
      isWorking: false,
      workingStartedAtMs: null,
    })
    expect(
      resolveOpenThreadWorking({
        openThreadId,
        snapshotThreadId: otherThreadId,
        sessionStatus: "running",
        latestTurn: running,
        send: leakedSend,
      }),
    ).toEqual({
      isAuthoritativeWorking: false,
      isWorking: false,
      workingStartedAtMs: null,
    })
    expect(
      resolveOpenThreadWorking({
        openThreadId,
        snapshotThreadId: openThreadId,
        sessionStatus: "running",
        latestTurn: running,
        send: leakedSend,
      }),
    ).toEqual({
      isAuthoritativeWorking: true,
      isWorking: true,
      workingStartedAtMs: Date.parse("2026-08-23T12:00:00.000Z"),
    })
    expect(
      resolveOpenThreadWorking({
        openThreadId: undefined,
        snapshotThreadId: undefined,
        sessionStatus: null,
        latestTurn: null,
        send: { threadId: undefined, startedAtMs: Date.parse("2026-08-23T12:00:00.000Z") },
      }),
    ).toEqual({
      isAuthoritativeWorking: false,
      isWorking: true,
      workingStartedAtMs: Date.parse("2026-08-23T12:00:00.000Z"),
    })
  })

  it("keeps the local send timestamp until the open Turn has its own start", () => {
    expect(
      resolveWorkingStartedAtMs({
        latestTurn: latestTurn({
          state: "completed",
          completedAt: "2026-08-23T12:01:00.000Z",
        }),
        sendStartedAtMs: 1_000,
      }),
    ).toBe(1_000)
    expect(
      resolveWorkingStartedAtMs({
        latestTurn: latestTurn({
          state: "running",
          requestedAt: "2026-08-23T12:00:00.000Z",
          startedAt: "2026-08-23T12:00:05.000Z",
        }),
        sendStartedAtMs: 1_000,
      }),
    ).toBe(Date.parse("2026-08-23T12:00:05.000Z"))
  })
})

describe("optimistic send remount cache", () => {
  it("retains the in-flight send so draft → Thread remount stays on the transcript", () => {
    const send = { threadId: openThreadId, startedAtMs: 1_700 }
    rememberOptimisticSend({ threadId: undefined, startedAtMs: 1_700 })
    expect(peekOptimisticSend(openThreadId)).toBeNull()
    rememberOptimisticSend(send)
    expect(peekOptimisticSend(openThreadId)).toEqual(send)
    expect(peekOptimisticSend(otherThreadId)).toBeNull()
    expect(peekOptimisticSend(undefined)).toBeNull()
    clearOptimisticSend()
    expect(peekOptimisticSend(openThreadId)).toEqual(send)
    clearOptimisticSend(openThreadId)
    expect(peekOptimisticSend(openThreadId)).toBeNull()
  })

  it("drops remount working state when created arrives after the Turn settled", () => {
    const sendStartedAtMs = Date.parse("2026-08-23T12:00:00.000Z")
    const createdCallbackAtMs = Date.parse("2026-08-23T12:00:00.800Z")
    const settled = latestTurn({
      state: "completed",
      completedAt: "2026-08-23T12:00:00.400Z",
    })
    expect(
      resolveOpenThreadWorking({
        openThreadId,
        snapshotThreadId: openThreadId,
        sessionStatus: "ready",
        latestTurn: settled,
        send: { threadId: openThreadId, startedAtMs: sendStartedAtMs },
      }),
    ).toEqual({
      isAuthoritativeWorking: false,
      isWorking: false,
      workingStartedAtMs: null,
    })
    expect(
      isOptimisticSendActive({
        sendStartedAtMs: createdCallbackAtMs,
        latestTurnCompletedAtMs: Date.parse("2026-08-23T12:00:00.400Z"),
        isAuthoritativeWorking: false,
      }),
    ).toBe(true)
  })
})
