import { describe, expect, it } from "@effect/vitest"
import {
  buildGeneratedWorktreeBranchName,
  buildTemporaryWorktreeBranchName,
  deriveRepositoryUrlFromCreateOutput,
  isTemporaryWorktreeBranch,
  resolveWorktreeRemoval,
} from "@noyau/server/git/git-runtime"

describe("GitRuntime helpers", () => {
  it("forme une branche temporaire noyau/<8 hex>", () => {
    expect(buildTemporaryWorktreeBranchName("F4AE4E0E-f971")).toBe("noyau/f4ae4e0e")
    expect(buildTemporaryWorktreeBranchName("ab")).toBe("noyau/ab000000")
  })

  it("reconnaît les branches temporaires noyau/<8 hex> et UUID v4", () => {
    expect(isTemporaryWorktreeBranch("noyau/f4ae4e0e")).toBe(true)
    expect(isTemporaryWorktreeBranch(" NOYAU/DEADBEEF ")).toBe(true)
    expect(isTemporaryWorktreeBranch("noyau/f4ae4e0e-f971-4d48-b4f2-9cf0aa54ab12")).toBe(true)
    expect(isTemporaryWorktreeBranch("noyau/safer-reconnect")).toBe(false)
    expect(isTemporaryWorktreeBranch("noyau/deadbeef-extra")).toBe(false)
    expect(isTemporaryWorktreeBranch("main")).toBe(false)
  })

  it("sanitize un nom généré en noyau/<slug>", () => {
    expect(buildGeneratedWorktreeBranchName("Safer reconnect backoff")).toBe(
      "noyau/safer-reconnect-backoff",
    )
    expect(buildGeneratedWorktreeBranchName("noyau/safer-reconnect")).toBe("noyau/safer-reconnect")
    expect(buildGeneratedWorktreeBranchName("refs/heads/feature/demo")).toBe("noyau/feature/demo")
    expect(buildGeneratedWorktreeBranchName("   ")).toBe("noyau/update")
  })

  it("refuse le checkout primaire et ignore un path déjà parti", () => {
    const listed = [
      { path: "/tmp/repo", refName: "main" },
      { path: "/tmp/worktrees/repo/feat", refName: "feat" },
    ]
    expect(resolveWorktreeRemoval(listed, "/tmp/repo")).toEqual({
      kind: "reject",
      detail: "Cannot remove the primary checkout.",
    })
    expect(resolveWorktreeRemoval(listed, "/tmp/elsewhere")).toEqual({ kind: "already-gone" })
    expect(resolveWorktreeRemoval(listed, "/tmp/worktrees/repo/feat")).toEqual({ kind: "remove" })
  })

  it("lit l’URL canonique de gh repo create", () => {
    expect(
      deriveRepositoryUrlFromCreateOutput("https://github.com/hezaerd/noyau\n", "ignored/fallback"),
    ).toEqual({
      nameWithOwner: "hezaerd/noyau",
      url: "https://github.com/hezaerd/noyau",
    })
    expect(deriveRepositoryUrlFromCreateOutput("", "hezaerd/noyau")).toEqual({
      nameWithOwner: "hezaerd/noyau",
      url: "https://github.com/hezaerd/noyau",
    })
  })
})
