import { ProjectId, ThreadId, TurnId } from "@noyau/contracts/ids"
import { ThreadShell } from "@noyau/contracts/shell"
import { Schema } from "effect"
import { describe, expect, it } from "vite-plus/test"

import { canSettle, changeRequestAutoSettles, effectiveSettled } from "../src/lib/thread-settled"

const NOW = Date.parse("2026-08-25T12:00:00.000Z")
const STALE_ISO = "2026-08-20T12:00:00.000Z"
const RECENT_ISO = "2026-08-25T11:00:00.000Z"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const turnId = TurnId.make("30000000-0000-4000-8000-000000000001")

const shell = (input: Partial<(typeof ThreadShell)["Encoded"]> = {}): ThreadShell =>
  Schema.decodeSync(ThreadShell)({
    id: threadId,
    projectId,
    title: "Thread",
    provider: "cursor",
    modelSelection: null,
    runtimeMode: "full-access",
    status: "active",
    latestTurn: {
      turnId,
      state: "completed",
      requestedAt: STALE_ISO,
      startedAt: STALE_ISO,
      completedAt: STALE_ISO,
    },
    sessionStatus: "ready",
    lastError: null,
    createdAt: STALE_ISO,
    updatedAt: STALE_ISO,
    ...input,
  })

describe("changeRequestAutoSettles", () => {
  it.each([
    ["open", true, false],
    ["closed", true, true],
    ["merged", true, true],
    ["merged", false, false],
    ["closed", false, true],
  ] as const)("state=%s autoSettleOnMerge=%s → %s", (state, autoSettleOnMerge, expected) => {
    expect(changeRequestAutoSettles(state, autoSettleOnMerge)).toBe(expected)
  })
})

describe("canSettle", () => {
  it("refuses a live session, a running turn, or a pending request", () => {
    expect(canSettle(shell({ sessionStatus: "running" }))).toBe(false)
    expect(
      canSettle(
        shell({
          latestTurn: {
            turnId,
            state: "running",
            requestedAt: RECENT_ISO,
            startedAt: RECENT_ISO,
            completedAt: null,
          },
        }),
      ),
    ).toBe(false)
    expect(canSettle(shell({ hasPendingApprovals: true }))).toBe(false)
    expect(canSettle(shell())).toBe(true)
  })
})

describe("effectiveSettled", () => {
  it("honors the explicit override, then PR, then inactivity", () => {
    expect(
      effectiveSettled(shell({ settledOverride: "settled", settledAt: STALE_ISO }), {
        nowMs: NOW,
        autoSettleAfterDays: 3,
      }),
    ).toBe(true)
    expect(
      effectiveSettled(shell({ settledOverride: "active" }), {
        nowMs: NOW,
        autoSettleAfterDays: 3,
        changeRequestState: "merged",
      }),
    ).toBe(false)
    expect(
      effectiveSettled(shell(), {
        nowMs: NOW,
        autoSettleAfterDays: null,
        changeRequestState: "merged",
      }),
    ).toBe(true)
    expect(
      effectiveSettled(shell(), {
        nowMs: NOW,
        autoSettleAfterDays: null,
        autoSettleOnMerge: false,
        changeRequestState: "merged",
      }),
    ).toBe(false)
    expect(
      effectiveSettled(shell(), {
        nowMs: NOW,
        autoSettleAfterDays: 3,
        changeRequestState: "open",
      }),
    ).toBe(false)
    expect(effectiveSettled(shell(), { nowMs: NOW, autoSettleAfterDays: 3 })).toBe(true)
    expect(
      effectiveSettled(
        shell({
          latestTurn: {
            turnId,
            state: "completed",
            requestedAt: RECENT_ISO,
            startedAt: RECENT_ISO,
            completedAt: RECENT_ISO,
          },
        }),
        { nowMs: NOW, autoSettleAfterDays: 3 },
      ),
    ).toBe(false)
  })

  it("keeps blocked work visible even when the override is settled", () => {
    expect(
      effectiveSettled(shell({ settledOverride: "settled", hasPendingUserInput: true }), {
        nowMs: NOW,
        autoSettleAfterDays: 3,
      }),
    ).toBe(false)
  })
})
