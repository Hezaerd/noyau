import { describe, expect, it } from "vite-plus/test"

import { isThreadCheckoutBusy, shouldAutoRemoveMergedWorktree } from "../src/lib/worktree-cleanup"

describe("worktree-cleanup", () => {
  it("supprime un worktree seulement si la PR est fusionnée et le Turn est idle", () => {
    expect(
      shouldAutoRemoveMergedWorktree({
        prState: "merged",
        worktreePath: "/tmp/wt",
        isRunning: false,
      }),
    ).toBe(true)
    expect(
      shouldAutoRemoveMergedWorktree({
        prState: "open",
        worktreePath: "/tmp/wt",
        isRunning: false,
      }),
    ).toBe(false)
    expect(
      shouldAutoRemoveMergedWorktree({
        prState: "merged",
        worktreePath: "/tmp/wt",
        isRunning: true,
      }),
    ).toBe(false)
    expect(
      shouldAutoRemoveMergedWorktree({
        prState: "merged",
        worktreePath: null,
        isRunning: false,
      }),
    ).toBe(false)
  })

  it("traite starting/running comme un checkout occupé", () => {
    expect(isThreadCheckoutBusy({ latestTurn: { state: "running" }, sessionStatus: "ready" })).toBe(
      true,
    )
    expect(
      isThreadCheckoutBusy({ latestTurn: { state: "completed" }, sessionStatus: "starting" }),
    ).toBe(true)
    expect(
      isThreadCheckoutBusy({ latestTurn: { state: "completed" }, sessionStatus: "ready" }),
    ).toBe(false)
  })
})
