import { describe, expect, it } from "@effect/vitest"

import {
  assertReleaseVersion,
  formatGitHubOutput,
  formatNightlyVersion,
  formatPackagedReleaseChannel,
  githubReleaseFlags,
  latestStableVersion,
  nextPatchVersion,
  releaseChannelFromVersion,
  resolveReleaseBrand,
  resolveReleaseMeta,
  splitReleaseCliArgs,
} from "./release-version.ts"

describe("release version", () => {
  it("strips the v prefix and rejects invalid versions", () => {
    expect(assertReleaseVersion("v1.2.3")).toBe("1.2.3")
    expect(assertReleaseVersion("1.2.3-beta.1")).toBe("1.2.3-beta.1")
    expect(() => assertReleaseVersion("main")).toThrow(/Invalid release version/)
  })

  it("bumps the patch of the last stable tag, else package.json", () => {
    expect(nextPatchVersion("0.0.0")).toBe("0.0.1")
    expect(nextPatchVersion("1.4.9")).toBe("1.4.10")
    expect(latestStableVersion(["v0.1.0", "v0.1.0-nightly.20260822.1", "v0.2.0"], "0.0.0")).toBe(
      "0.2.0",
    )
    expect(latestStableVersion(["v0.1.0-nightly.20260822.1"], "0.3.0-dev")).toBe("0.3.0")
  })

  it("formats nightly versions from the next patch", () => {
    expect(formatNightlyVersion("0.1.0", "20260822", 12)).toBe("0.1.1-nightly.20260822.12")
    expect(() => formatNightlyVersion("0.1.0", "2026-08-22", 1)).toThrow(/Invalid nightly date/)
    expect(() => formatNightlyVersion("0.1.0", "20260822", 0)).toThrow(/Invalid nightly run number/)
  })

  it("marks only plain X.Y.Z as the GitHub latest release", () => {
    expect(githubReleaseFlags("0.1.0")).toEqual({ isPrerelease: false, makeLatest: true })
    expect(githubReleaseFlags("0.1.0-beta.1")).toEqual({ isPrerelease: true, makeLatest: false })
  })

  it("resolves latest from a tag push and nightly from dispatch", () => {
    expect(
      resolveReleaseMeta("push", "latest", "", "v0.2.0", "0.1.0", ["v0.1.0"], "20260822", 3),
    ).toEqual({
      channel: "latest",
      version: "0.2.0",
      tag: "v0.2.0",
      name: "Noyau v0.2.0",
      isPrerelease: false,
      makeLatest: true,
    })
    expect(
      resolveReleaseMeta(
        "workflow_dispatch",
        "nightly",
        "",
        "main",
        "0.1.0",
        ["v0.1.0"],
        "20260822",
        3,
      ),
    ).toEqual({
      channel: "nightly",
      version: "0.1.1-nightly.20260822.3",
      tag: "v0.1.1-nightly.20260822.3",
      name: "Noyau v0.1.1-nightly.20260822.3",
      isPrerelease: true,
      makeLatest: false,
    })
    expect(() =>
      resolveReleaseMeta("workflow_dispatch", "latest", "", "main", "0.1.0", [], "20260822", 1),
    ).toThrow(/version input/)
    expect(() =>
      resolveReleaseMeta(
        "push",
        "latest",
        "",
        "v0.1.1-nightly.20260822.1",
        "0.1.0",
        [],
        "20260822",
        1,
      ),
    ).toThrow(/nightly version/)
  })

  it("brands nightly separately from latest", () => {
    expect(releaseChannelFromVersion("0.1.0")).toBe("latest")
    expect(releaseChannelFromVersion("0.1.1-nightly.20260822.3")).toBe("nightly")
    expect(resolveReleaseBrand("latest")).toEqual({
      displayName: "Noyau",
      bundleId: "dev.noyau.desktop",
      iconDirectory: "prod",
      macIcon: "assets/prod/app-icon.icns",
      winIcon: "assets/prod/app-icon.png",
    })
    expect(resolveReleaseBrand("nightly").displayName).toBe("Noyau (Nightly)")
    expect(resolveReleaseBrand("nightly").bundleId).toBe("dev.noyau.desktop.nightly")
    expect(formatPackagedReleaseChannel("nightly")).toBe('{"channel":"nightly"}\n')
  })

  it("keeps git tags after -- for the CLI", () => {
    expect(
      splitReleaseCliArgs(["--event", "push", "--", "v0.1.0", "v0.1.1-nightly.20260822.1"]),
    ).toEqual({
      flags: ["--event", "push"],
      tags: ["v0.1.0", "v0.1.1-nightly.20260822.1"],
    })
    expect(splitReleaseCliArgs(["--event", "push"])).toEqual({
      flags: ["--event", "push"],
      tags: [],
    })
  })

  it("writes GitHub Actions outputs", () => {
    expect(
      formatGitHubOutput({
        channel: "nightly",
        version: "0.1.1-nightly.20260822.3",
        tag: "v0.1.1-nightly.20260822.3",
        name: "Noyau v0.1.1-nightly.20260822.3",
        isPrerelease: true,
        makeLatest: false,
      }),
    ).toBe(
      [
        "release_channel=nightly",
        "version=0.1.1-nightly.20260822.3",
        "tag=v0.1.1-nightly.20260822.3",
        "name=Noyau v0.1.1-nightly.20260822.3",
        "is_prerelease=true",
        "make_latest=false",
      ].join("\n"),
    )
  })
})
