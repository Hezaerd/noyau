import { describe, expect, it } from "vite-plus/test"

import {
  branchPickerBadge,
  envModeLockedAfterFirstTurn,
  envModeOf,
  resolveBranchSelectionTarget,
  resolveLocalCheckoutBranchMismatch,
} from "../src/lib/checkout"

describe("checkout helpers", () => {
  it("verrouille le checkout dès le premier Turn", () => {
    expect(envModeLockedAfterFirstTurn({ latestTurn: null })).toBe(false)
    expect(envModeLockedAfterFirstTurn({})).toBe(false)
    expect(envModeLockedAfterFirstTurn({ latestTurn: null, isRunning: true })).toBe(true)
    expect(envModeLockedAfterFirstTurn({ latestTurn: { turnId: "turn_1" } })).toBe(true)
  })

  it("priorise current, worktree, puis default sur le badge", () => {
    expect(
      branchPickerBadge(
        { current: true, isDefault: true, isRemote: false, worktreePath: "/tmp/wt" },
        "/tmp/repo",
      ),
    ).toBe("current")
    expect(
      branchPickerBadge(
        { current: false, isDefault: true, isRemote: false, worktreePath: "/tmp/wt" },
        "/tmp/repo",
      ),
    ).toBe("worktree")
    expect(
      branchPickerBadge(
        { current: false, isDefault: true, isRemote: false, worktreePath: null },
        "/tmp/repo",
      ),
    ).toBe("default")
    expect(
      branchPickerBadge(
        { current: false, isDefault: false, isRemote: false, worktreePath: "/tmp/repo" },
        "/tmp/repo",
      ),
    ).toBeNull()
  })

  it("traite worktreePath null comme local", () => {
    expect(envModeOf({ branch: "main", worktreePath: null })).toBe("local")
    expect(envModeOf({ branch: "feat", worktreePath: "/tmp/wt" })).toBe("worktree")
  })

  it("réutilise un worktree déjà extrait ailleurs", () => {
    expect(
      resolveBranchSelectionTarget(
        { name: "feat", isRemote: false, worktreePath: "/tmp/other" },
        "/tmp/repo",
      ),
    ).toEqual({ kind: "reuse", worktreePath: "/tmp/other" })
    expect(
      resolveBranchSelectionTarget(
        { name: "main", isRemote: false, worktreePath: "/tmp/repo" },
        "/tmp/repo",
      ),
    ).toEqual({ kind: "switch" })
  })

  it("signale un mismatch seulement en local sans worktree", () => {
    expect(
      resolveLocalCheckoutBranchMismatch({
        envMode: "local",
        threadBranch: "feat",
        liveBranch: "main",
        worktreePath: null,
      }),
    ).toEqual({ previous: "feat", current: "main" })
    expect(
      resolveLocalCheckoutBranchMismatch({
        envMode: "worktree",
        threadBranch: "feat",
        liveBranch: "main",
        worktreePath: null,
      }),
    ).toBeNull()
  })
})
