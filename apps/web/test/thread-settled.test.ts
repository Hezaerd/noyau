import { ProjectId, ThreadId, TurnId } from "@noyau/contracts/ids"
import { ThreadShell } from "@noyau/contracts/shell"
import { Schema } from "effect"
import { describe, expect, it } from "vite-plus/test"

import {
  canSettle,
  changeRequestAutoSettles,
  changeRequestSettleDecision,
  effectiveSettled,
} from "../src/lib/thread-settled"

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
    listedAt: STALE_ISO,
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

describe("changeRequestSettleDecision", () => {
  const base = {
    autoSettleOnMerge: true,
    canSettle: true,
    settledOverride: null,
  } as const

  it("persists on the first sight of a terminal PR", () => {
    expect(
      changeRequestSettleDecision({
        ...base,
        previous: null,
        next: { number: 12, state: "merged" },
      }),
    ).toBe("persist")
    expect(
      changeRequestSettleDecision({
        ...base,
        previous: { number: 12, state: "open" },
        next: { number: 12, state: "merged" },
      }),
    ).toBe("persist")
    expect(
      changeRequestSettleDecision({
        ...base,
        autoSettleOnMerge: false,
        previous: null,
        next: { number: 12, state: "closed" },
      }),
    ).toBe("persist")
  })

  it("does not re-persist the same merge after activity clears the pin", () => {
    expect(
      changeRequestSettleDecision({
        ...base,
        previous: { number: 12, state: "merged" },
        next: { number: 12, state: "merged" },
      }),
    ).toBe("remember")
    expect(
      changeRequestSettleDecision({
        ...base,
        settledOverride: "active",
        previous: null,
        next: { number: 12, state: "merged" },
      }),
    ).toBe("remember")
  })

  it("retries while the Thread cannot settle, then allows a later persist", () => {
    expect(
      changeRequestSettleDecision({
        ...base,
        canSettle: false,
        previous: { number: 12, state: "open" },
        next: { number: 12, state: "merged" },
      }),
    ).toBe("retry")
  })

  it("persists again only for a different PR", () => {
    expect(
      changeRequestSettleDecision({
        ...base,
        previous: { number: 12, state: "merged" },
        next: { number: 15, state: "merged" },
      }),
    ).toBe("persist")
    expect(
      changeRequestSettleDecision({
        ...base,
        autoSettleOnMerge: false,
        previous: null,
        next: { number: 12, state: "merged" },
      }),
    ).toBe("remember")
  })
})

describe("effectiveSettled", () => {
  it("honors the explicit override, then inactivity, and keeps an open PR visible", () => {
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
