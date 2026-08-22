import { fileURLToPath } from "node:url"

import * as NodeServices from "@effect/platform-node/NodeServices"
import { describe, expect, it } from "@effect/vitest"
import { Effect, FileSystem } from "effect"

import { resolveAppIdentity } from "./electron-launcher.ts"
import {
  assertHostCanPackage,
  electronBuilderArgs,
  parsePackageDesktopArgs,
  requiredPackagedArtifacts,
  resolveElectronBuilderCli,
} from "./package-desktop-plan.ts"

const builderConfigPath = fileURLToPath(new URL("../electron-builder.yml", import.meta.url))

describe("package desktop", () => {
  it("packages the assembled dist-electron layout, with the server as extraResources", () => {
    expect(requiredPackagedArtifacts()).toEqual([
      "dist-electron/main.cjs",
      "dist-electron/preload.cjs",
      "dist-electron/renderer/index.html",
      "dist-electron/server/main.mjs",
    ])
  })

  it("defaults to an unpacked host-platform package", () => {
    expect(parsePackageDesktopArgs([], "darwin")).toEqual({
      platform: "mac",
      target: "dir",
      arch: undefined,
      buildVersion: undefined,
      skipBuild: false,
    })
    expect(parsePackageDesktopArgs(["--skip-build", "--dmg"], "darwin")).toEqual({
      platform: "mac",
      target: "dmg",
      arch: undefined,
      buildVersion: undefined,
      skipBuild: true,
    })
    expect(parsePackageDesktopArgs([], "win32")).toEqual({
      platform: "win",
      target: "dir",
      arch: undefined,
      buildVersion: undefined,
      skipBuild: false,
    })
  })

  it("accepts release architecture and version flags", () => {
    expect(
      parsePackageDesktopArgs(
        ["--mac", "--dmg", "--arch", "arm64", "--build-version", "0.1.0-nightly.20260822.12"],
        "darwin",
      ),
    ).toEqual({
      platform: "mac",
      target: "dmg",
      arch: "arm64",
      buildVersion: "0.1.0-nightly.20260822.12",
      skipBuild: false,
    })
    expect(parsePackageDesktopArgs(["--win", "--nsis", "--arch", "x64"], "win32")).toEqual({
      platform: "win",
      target: "nsis",
      arch: "x64",
      buildVersion: undefined,
      skipBuild: false,
    })
  })

  it("rejects mixed platforms, targets, and cross-compilation", () => {
    expect(() => parsePackageDesktopArgs(["--mac", "--win"], "darwin")).toThrow(
      /either --mac or --win/,
    )
    expect(() => parsePackageDesktopArgs(["--dmg", "--nsis"], "darwin")).toThrow(/single target/)
    expect(() => parsePackageDesktopArgs(["--win", "--dmg"], "win32")).toThrow(/macOS target/)
    expect(() => parsePackageDesktopArgs(["--mac", "--nsis"], "darwin")).toThrow(/Windows target/)
    expect(() => parsePackageDesktopArgs(["--unknown"], "darwin")).toThrow(/Unknown packaging flag/)
    expect(() => parsePackageDesktopArgs(["--arch"], "darwin")).toThrow(/--arch requires a value/)
    expect(() => parsePackageDesktopArgs(["--arch", "universal"], "darwin")).toThrow(/arm64 or x64/)
    expect(() => parsePackageDesktopArgs(["--build-version", "not-a-version"], "darwin")).toThrow(
      /Invalid --build-version/,
    )
    expect(() => parsePackageDesktopArgs([], "linux")).toThrow(/Package macOS from a Mac/)
    expect(() => assertHostCanPackage("mac", "win32")).toThrow(/Package macOS from a Mac/)
    expect(() => assertHostCanPackage("win", "darwin")).toThrow(
      /Package Windows from a Windows machine/,
    )
  })

  it("resolves the electron-builder CLI from the desktop workspace", () => {
    expect(resolveElectronBuilderCli().endsWith("electron-builder/cli.js")).toBe(true)
  })

  it("asks electron-builder for an unsigned artifact", () => {
    expect(electronBuilderArgs("mac", "dir", undefined, "latest", undefined)).toEqual([
      "--mac",
      "dir",
      "--publish",
      "never",
      "-c.extraMetadata.noyauReleaseChannel=latest",
    ])
    expect(electronBuilderArgs("mac", "dmg", "arm64", "latest", "0.1.0")).toEqual([
      "--mac",
      "dmg",
      "--arm64",
      "--publish",
      "never",
      "-c.extraMetadata.noyauReleaseChannel=latest",
      "-c.extraMetadata.version=0.1.0",
    ])
    expect(
      electronBuilderArgs("win", "nsis", "x64", "nightly", "0.1.0-nightly.20260822.1"),
    ).toEqual([
      "--win",
      "nsis",
      "--x64",
      "--publish",
      "never",
      "-c.extraMetadata.noyauReleaseChannel=nightly",
      "-c.extraMetadata.version=0.1.0-nightly.20260822.1",
      "-c.productName=Noyau (Nightly)",
      "-c.extraMetadata.productName=Noyau (Nightly)",
      "-c.appId=dev.noyau.desktop.nightly",
      "-c.mac.icon=assets/nightly/app-icon.icns",
      "-c.win.icon=assets/nightly/app-icon.png",
    ])
  })
})

it.layer(NodeServices.layer)("electron-builder config", (spec) => {
  spec.effect("keeps the appId aligned with the packaged identity", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const config = yield* fs.readFileString(builderConfigPath)
      const identity = resolveAppIdentity("latest")

      expect(identity).toEqual({ displayName: "Noyau", bundleId: "dev.noyau.desktop" })
      expect(config).toContain("appId: dev.noyau.desktop")
      expect(config).toContain("productName: Noyau")
      expect(config).toContain("to: server")
      expect(config).toContain("identity: null")
      expect(config).toContain("afterPack: scripts/after-pack.cjs")
      expect(config).toContain("icon: assets/prod/app-icon.icns")
      expect(config).toContain("dist-electron/release-channel.json")
      expect(config).toContain('"!**/node_modules/**"')
      expect(config).toContain("artifactName: Noyau-${version}-${os}-${arch}.${ext}")
    }),
  )
})
