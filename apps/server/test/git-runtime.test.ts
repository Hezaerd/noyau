import { describe, expect, it } from "@effect/vitest"
import {
  buildTemporaryWorktreeBranchName,
  deriveRepositoryUrlFromCreateOutput,
} from "@noyau/server/git/git-runtime"

describe("GitRuntime helpers", () => {
  it("forme une branche temporaire noyau/<8 hex>", () => {
    expect(buildTemporaryWorktreeBranchName("F4AE4E0E-f971")).toBe("noyau/f4ae4e0e")
    expect(buildTemporaryWorktreeBranchName("ab")).toBe("noyau/ab000000")
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
