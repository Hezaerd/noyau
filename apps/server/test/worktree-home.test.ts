import { describe, expect, it } from "@effect/vitest"
import {
  resolveWorktreesDir,
  worktreeHomeChannel,
  worktreeHomeRelativeSegments,
} from "@noyau/server/worktree-home"

const join = (...segments: ReadonlyArray<string>): string => segments.join("/")

describe("WorktreeHome", () => {
  it("mappe development vers le segment dossier dev", () => {
    expect(worktreeHomeChannel("development")).toBe("dev")
    expect(worktreeHomeChannel("latest")).toBe("latest")
    expect(worktreeHomeChannel("nightly")).toBe("nightly")
  })

  it("place les worktrees sous ~/.noyau/<canal>/worktree", () => {
    expect(worktreeHomeRelativeSegments("development")).toEqual([".noyau", "dev", "worktree"])
    expect(worktreeHomeRelativeSegments("nightly")).toEqual([".noyau", "nightly", "worktree"])
    expect(resolveWorktreesDir(join, "/Users/moi", "nightly")).toBe(
      "/Users/moi/.noyau/nightly/worktree",
    )
    expect(resolveWorktreesDir(join, "/Users/moi", "development")).toBe(
      "/Users/moi/.noyau/dev/worktree",
    )
  })
})
