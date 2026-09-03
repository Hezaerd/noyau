import {
  liveConfigSeedDirectories,
  planWorktreeConfigSeed,
  pointsAtLinkedWorktree,
  resolveConfigDirectory,
  resolveChannelHome,
  resolveDevHome,
  shouldSeedWorktreeConfig,
  worktreeNoyauHome,
} from "@noyau/shared/dev-home"
import { describe, expect, it } from "vitest"

const normalize = (path: string): string => path.replaceAll(/\/+/g, "/")
const join = (...segments: string[]) => segments.join("/")

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

  it("parks packaged config under ~/.noyau/<channel>", () => {
    expect(resolveChannelHome(join, "/Users/moi", "nightly")).toBe("/Users/moi/.noyau/nightly")
    expect(
      resolveConfigDirectory({
        join,
        dataDirectory: "/Library/Application Support/Noyau/environment",
        homeDirectory: "/Users/moi",
        releaseChannel: "nightly",
        explicitHome: false,
      }),
    ).toBe("/Users/moi/.noyau/nightly")
    expect(
      resolveConfigDirectory({
        join,
        dataDirectory: "/tmp/wt/.noyau",
        homeDirectory: "/Users/moi",
        releaseChannel: "nightly",
        explicitHome: true,
      }),
    ).toBe("/tmp/wt/.noyau")
  })

  it("seeds only missing config files from the first live source", () => {
    expect(
      shouldSeedWorktreeConfig({ explicitHomeDir: false, worktreeHome: "/tmp/wt/.noyau" }),
    ).toBe(true)
    expect(
      shouldSeedWorktreeConfig({ explicitHomeDir: true, worktreeHome: "/tmp/wt/.noyau" }),
    ).toBe(false)
    expect(
      liveConfigSeedDirectories({
        join,
        homeDirectory: "/Users/moi",
        releaseChannel: "nightly",
      }),
    ).toEqual([
      "/Users/moi/.noyau/nightly",
      "/Users/moi/.noyau/userdata",
      "/Users/moi/.noyau/latest",
    ])
    expect(
      planWorktreeConfigSeed({
        destDirectory: "/tmp/wt/.noyau",
        sourceDirectories: ["/Users/moi/.noyau/nightly", "/Users/moi/.noyau/userdata"],
        destExists: (fileName) => fileName === "settings.json",
        sourceExists: (directory, fileName) =>
          directory === "/Users/moi/.noyau/nightly" && fileName === "keybindings.json",
        join,
      }),
    ).toEqual([
      {
        from: "/Users/moi/.noyau/nightly/keybindings.json",
        to: "/tmp/wt/.noyau/keybindings.json",
      },
    ])
  })
})
