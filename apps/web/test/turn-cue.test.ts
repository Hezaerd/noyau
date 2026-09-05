import { describe, expect, it } from "vitest"

import { isRendererForeground } from "../src/lib/renderer-foreground"
import { settledTurns } from "../src/lib/turn-cue"

describe("turn cue", () => {
  it("treats the renderer as foreground only when visible and focused", () => {
    expect(isRendererForeground({ visibilityState: "visible", hasFocus: true })).toBe(true)
    expect(isRendererForeground({ visibilityState: "visible", hasFocus: false })).toBe(false)
    expect(isRendererForeground({ visibilityState: "hidden", hasFocus: true })).toBe(false)
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

  it("detects a newly observed settled Turn even when running was batched away", () => {
    expect(
      settledTurns(
        [{ id: "thread-a", latestTurn: { turnId: "turn-1", state: "completed" } }],
        [{ id: "thread-a", latestTurn: { turnId: "turn-2", state: "completed" } }],
      ),
    ).toEqual([{ threadId: "thread-a", turnId: "turn-2", state: "completed" }])
    expect(
      settledTurns([], [{ id: "thread-a", latestTurn: { turnId: "turn-1", state: "completed" } }]),
    ).toEqual([{ threadId: "thread-a", turnId: "turn-1", state: "completed" }])
  })
})
