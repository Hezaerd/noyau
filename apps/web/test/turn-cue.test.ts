import { describe, expect, it } from "vite-plus/test"

import { isTurnCueSound, settledTurns, type TurnCueThread } from "../src/lib/turn-cue"

const thread = (id: string, latestTurn: TurnCueThread["latestTurn"]): TurnCueThread => ({
  id,
  latestTurn,
})

const running = { turnId: "turn-1", state: "running" as const }
const completed = { turnId: "turn-1", state: "completed" as const }
const interrupted = { turnId: "turn-1", state: "interrupted" as const }
const errored = { turnId: "turn-1", state: "error" as const }

describe("turn cue", () => {
  it("accepts the curated Cuelume subset and rejects the rest", () => {
    expect(isTurnCueSound("arrival")).toBe(true)
    expect(isTurnCueSound("chime")).toBe(true)
    expect(isTurnCueSound("toggle")).toBe(false)
    expect(isTurnCueSound("unknown")).toBe(false)
  })

  it("fires when the same Turn leaves running", () => {
    expect(settledTurns([thread("t1", running)], [thread("t1", completed)])).toEqual([
      { threadId: "t1", turnId: "turn-1", state: "completed" },
    ])
    expect(settledTurns([thread("t1", running)], [thread("t1", interrupted)])).toEqual([
      { threadId: "t1", turnId: "turn-1", state: "interrupted" },
    ])
    expect(settledTurns([thread("t1", running)], [thread("t1", errored)])).toEqual([
      { threadId: "t1", turnId: "turn-1", state: "error" },
    ])
  })

  it("ignores boot snapshots, duplicates, and unseen Turns", () => {
    expect(settledTurns([], [thread("t1", completed)])).toEqual([])
    expect(settledTurns([thread("t1", completed)], [thread("t1", completed)])).toEqual([])
    expect(settledTurns([thread("t1", null)], [thread("t1", completed)])).toEqual([])
    expect(
      settledTurns(
        [thread("t1", running)],
        [thread("t1", { turnId: "turn-2", state: "completed" })],
      ),
    ).toEqual([])
    expect(settledTurns([thread("t1", running)], [thread("t1", running)])).toEqual([])
  })

  it("coalesces several settlements in one shell tick", () => {
    expect(
      settledTurns(
        [thread("t1", running), thread("t2", { turnId: "turn-9", state: "running" })],
        [thread("t1", completed), thread("t2", { turnId: "turn-9", state: "error" })],
      ),
    ).toEqual([
      { threadId: "t1", turnId: "turn-1", state: "completed" },
      { threadId: "t2", turnId: "turn-9", state: "error" },
    ])
  })
})
