import { describe, expect, it } from "vite-plus/test"

import { settledTurns } from "../src/lib/turn-cue"
import {
  isRendererForeground,
  shouldNotifyTurnSettlement,
  turnNotificationBody,
} from "../src/lib/turn-notification"
import { parseTurnNotificationEnabled } from "../src/lib/turn-notification-preference"

describe("turn notification", () => {
  it("defaults on and only accepts on/off", () => {
    expect(parseTurnNotificationEnabled(null)).toBe(true)
    expect(parseTurnNotificationEnabled("off")).toBe(false)
    expect(parseTurnNotificationEnabled("on")).toBe(true)
    expect(parseTurnNotificationEnabled("nope")).toBe(true)
  })

  it("treats the renderer as foreground only when visible and focused", () => {
    expect(isRendererForeground({ visibilityState: "visible", hasFocus: true })).toBe(true)
    expect(isRendererForeground({ visibilityState: "visible", hasFocus: false })).toBe(false)
    expect(isRendererForeground({ visibilityState: "hidden", hasFocus: true })).toBe(false)
  })

  it("skips the banner when the open Thread is already in the foreground", () => {
    expect(
      shouldNotifyTurnSettlement({
        enabled: true,
        isDesktop: true,
        threadId: "thread-a",
        openThreadId: "thread-a",
        windowFocused: true,
      }),
    ).toBe(false)
    expect(
      shouldNotifyTurnSettlement({
        enabled: true,
        isDesktop: true,
        threadId: "thread-a",
        openThreadId: "thread-a",
        windowFocused: false,
      }),
    ).toBe(true)
    expect(
      shouldNotifyTurnSettlement({
        enabled: true,
        isDesktop: true,
        threadId: "thread-a",
        openThreadId: "thread-b",
        windowFocused: true,
      }),
    ).toBe(true)
    expect(
      shouldNotifyTurnSettlement({
        enabled: false,
        isDesktop: true,
        threadId: "thread-a",
        openThreadId: "thread-b",
        windowFocused: false,
      }),
    ).toBe(false)
    expect(
      shouldNotifyTurnSettlement({
        enabled: true,
        isDesktop: false,
        threadId: "thread-a",
        openThreadId: "thread-b",
        windowFocused: false,
      }),
    ).toBe(false)
  })

  it("labels the banner with the Project and settlement", () => {
    expect(turnNotificationBody("completed", "Noyau")).toBe("Noyau · Done")
    expect(turnNotificationBody("interrupted", undefined)).toBe("Interrupted")
    expect(turnNotificationBody("error", "")).toBe("Error")
  })

  it("detects a Turn leaving running", () => {
    expect(
      settledTurns(
        [{ id: "thread-a", latestTurn: { turnId: "turn-1", state: "running" } }],
        [{ id: "thread-a", latestTurn: { turnId: "turn-1", state: "completed" } }],
      ),
    ).toEqual([{ threadId: "thread-a", turnId: "turn-1", state: "completed" }])
    expect(
      settledTurns(
        [{ id: "thread-a", latestTurn: { turnId: "turn-1", state: "completed" } }],
        [{ id: "thread-a", latestTurn: { turnId: "turn-1", state: "completed" } }],
      ),
    ).toEqual([])
  })
})
