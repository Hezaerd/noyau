import { describe, expect, it } from "@effect/vitest"
import {
  buildGeneratedWorktreeBranchName,
  buildTemporaryWorktreeBranchName,
  deriveRepositoryUrlFromCreateOutput,
  isTemporaryWorktreeBranch,
  sanitizeWorktreeFolderName,
  unavailableVcsStatus,
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

  it("aplatit la branche en un seul nom de dossier worktree", () => {
    expect(sanitizeWorktreeFolderName("noyau/f4ae4e0e")).toBe("f4ae4e0e")
    expect(sanitizeWorktreeFolderName("noyau/safer-reconnect")).toBe("safer-reconnect")
    expect(sanitizeWorktreeFolderName("noyau/feature/demo")).toBe("feature-demo")
    expect(sanitizeWorktreeFolderName("   ")).toBe("worktree")
  })

  it("sanitize un nom généré en noyau/<slug>", () => {
    expect(buildGeneratedWorktreeBranchName("Safer reconnect backoff")).toBe(
      "noyau/safer-reconnect-backoff",
    )
    expect(buildGeneratedWorktreeBranchName("noyau/safer-reconnect")).toBe("noyau/safer-reconnect")
    expect(buildGeneratedWorktreeBranchName("refs/heads/feature/demo")).toBe("noyau/feature/demo")
    expect(buildGeneratedWorktreeBranchName("   ")).toBe("noyau/update")
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

  it("représente un cwd manquant comme un status VCS indisponible", () => {
    expect(unavailableVcsStatus("/missing/worktree")).toEqual({
      isRepo: false,
      cwd: "/missing/worktree",
      refName: null,
      isDefaultRef: false,
      hasPrimaryRemote: false,
      hasWorkingTreeChanges: false,
      hasUpstream: false,
      aheadCount: 0,
      behindCount: 0,
      worktreePath: null,
      pr: null,
    })
  })
})
