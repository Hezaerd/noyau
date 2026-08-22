import * as NodeServices from "@effect/platform-node/NodeServices"
import { describe, expect, it } from "@effect/vitest"
import { Effect, FileSystem, Path } from "effect"

import {
  collectReleaseAssets,
  isPublishableInstallerName,
  listPublishableInstallerNames,
  parseCollectReleaseAssetsArgs,
} from "./collect-release-assets.ts"

describe("collect release assets", () => {
  it("keeps versioned installers and drops unpacked Electron binaries", () => {
    expect(isPublishableInstallerName("Noyau-0.0.1-nightly.20260822.2-win-x64.exe")).toBe(true)
    expect(isPublishableInstallerName("Noyau-0.0.1-nightly.20260822.2-mac-arm64.dmg")).toBe(true)
    expect(isPublishableInstallerName("Noyau-0.1.0-win-x64.exe")).toBe(true)
    expect(isPublishableInstallerName("Noyau.Nightly.exe")).toBe(false)
    expect(isPublishableInstallerName("Noyau (Nightly).exe")).toBe(false)
    expect(isPublishableInstallerName("Noyau.exe")).toBe(false)
    expect(isPublishableInstallerName("builder-debug.yml")).toBe(false)
    expect(
      listPublishableInstallerNames([
        "Noyau-0.0.1-nightly.20260822.2-win-x64.exe",
        "Noyau.Nightly.exe",
        "Noyau (Nightly).exe",
        "win-unpacked",
        "Noyau-0.0.1-nightly.20260822.2-mac-arm64.dmg",
      ]),
    ).toEqual([
      "Noyau-0.0.1-nightly.20260822.2-win-x64.exe",
      "Noyau-0.0.1-nightly.20260822.2-mac-arm64.dmg",
    ])
  })

  it("requires --from and --to", () => {
    expect(parseCollectReleaseAssetsArgs(["--from", "release", "--to", "out"])).toEqual({
      from: "release",
      to: "out",
    })
    expect(() => parseCollectReleaseAssetsArgs(["--from", "release"])).toThrow(
      /--to requires a value/,
    )
    expect(() => parseCollectReleaseAssetsArgs(["--to", "out"])).toThrow(/--from requires a value/)
    expect(() => parseCollectReleaseAssetsArgs(["--from"])).toThrow(/--from requires a value/)
    expect(() => parseCollectReleaseAssetsArgs(["--unknown"])).toThrow(/Unknown collect flag/)
  })
})

it.layer(NodeServices.layer)("collect release assets copy", (spec) => {
  spec.effect("copies only top-level versioned installers", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const fs = yield* FileSystem.FileSystem
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "noyau-collect-" })
      const from = path.join(root, "release")
      const to = path.join(root, "publish")
      const unpacked = path.join(from, "win-unpacked")
      yield* fs.makeDirectory(unpacked, { recursive: true })
      yield* fs.writeFileString(
        path.join(from, "Noyau-0.0.1-nightly.20260822.2-win-x64.exe"),
        "nsis",
      )
      yield* fs.writeFileString(path.join(from, "Noyau.Nightly.exe"), "stray")
      yield* fs.writeFileString(path.join(unpacked, "Noyau (Nightly).exe"), "unpacked")

      const copied = yield* collectReleaseAssets({ from, to })
      const installer = path.join(to, "Noyau-0.0.1-nightly.20260822.2-win-x64.exe")
      expect(copied).toEqual([installer])
      expect(yield* fs.readFileString(installer)).toBe("nsis")
      expect(yield* fs.exists(path.join(to, "Noyau.Nightly.exe"))).toBe(false)
      expect(yield* fs.exists(path.join(to, "Noyau (Nightly).exe"))).toBe(false)
    }),
  )
})
