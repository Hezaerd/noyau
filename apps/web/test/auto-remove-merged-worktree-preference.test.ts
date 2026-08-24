import { describe, expect, it } from "vite-plus/test"

import { parseAutoRemoveMergedWorktreeEnabled } from "../src/lib/auto-remove-merged-worktree-preference"

describe("auto-remove merged worktree preference", () => {
  it("defaults to off and only treats on as enabled", () => {
    expect(parseAutoRemoveMergedWorktreeEnabled(null)).toBe(false)
    expect(parseAutoRemoveMergedWorktreeEnabled("")).toBe(false)
    expect(parseAutoRemoveMergedWorktreeEnabled("off")).toBe(false)
    expect(parseAutoRemoveMergedWorktreeEnabled("on")).toBe(true)
    expect(parseAutoRemoveMergedWorktreeEnabled("true")).toBe(false)
  })
})
