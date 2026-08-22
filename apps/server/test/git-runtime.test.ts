import { describe, expect, it } from "@effect/vitest"
import { buildTemporaryWorktreeBranchName } from "@noyau/server/git/git-runtime"

describe("GitRuntime helpers", () => {
  it("forme une branche temporaire noyau/<8 hex>", () => {
    expect(buildTemporaryWorktreeBranchName("F4AE4E0E-f971")).toBe("noyau/f4ae4e0e")
    expect(buildTemporaryWorktreeBranchName("ab")).toBe("noyau/ab000000")
  })
})
