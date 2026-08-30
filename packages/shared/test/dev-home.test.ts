import { pointsAtLinkedWorktree, resolveDevHome, worktreeNoyauHome } from "@noyau/shared/dev-home"
import { describe, expect, it } from "vite-plus/test"

const normalize = (path: string): string => path.replaceAll(/\/+/g, "/")

describe("dev home", () => {
  it("recognizes a linked worktree gitdir pointer", () => {
    expect(
      pointsAtLinkedWorktree("gitdir: /Users/moi/noyau/.git/worktrees/8ac0a6f7\n", normalize),
    ).toBe(true)
  })

  it("rejects the main checkout and a submodule pointer", () => {
    expect(pointsAtLinkedWorktree("", normalize)).toBe(false)
    expect(pointsAtLinkedWorktree("gitdir: /Users/moi/noyau/.git\n", normalize)).toBe(false)
    expect(
      pointsAtLinkedWorktree("gitdir: /Users/moi/noyau/.git/modules/repos/effect\n", normalize),
    ).toBe(false)
  })

  it("places worktree state under that checkout's .noyau", () => {
    expect(worktreeNoyauHome("/tmp/wt", (...segments) => segments.join("/"))).toBe("/tmp/wt/.noyau")
  })

  it("lets --home-dir beat a worktree default and an ambient home", () => {
    expect(resolveDevHome("/explicit", "/tmp/wt/.noyau", "/Users/moi/.noyau")).toBe("/explicit")
  })

  it("lets the worktree default beat an ambient NOYAU_HOME", () => {
    expect(resolveDevHome(undefined, "/tmp/wt/.noyau", "/Users/moi/.noyau")).toBe("/tmp/wt/.noyau")
  })

  it("treats a blank --home-dir as unset so the worktree default still wins", () => {
    expect(resolveDevHome("   ", "/tmp/wt/.noyau", "/Users/moi/.noyau")).toBe("/tmp/wt/.noyau")
  })

  it("falls back to the ambient home outside a worktree", () => {
    expect(resolveDevHome(undefined, undefined, "/Users/moi/.noyau")).toBe("/Users/moi/.noyau")
  })
})
