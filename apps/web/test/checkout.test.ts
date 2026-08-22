import { describe, expect, it } from "vite-plus/test"

import {
  envModeOf,
  resolveBranchSelectionTarget,
  resolveLocalCheckoutBranchMismatch,
} from "../src/lib/checkout"

describe("checkout helpers", () => {
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
