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
      skipBuild: false,
    })
    expect(parsePackageDesktopArgs(["--skip-build", "--dmg"], "darwin")).toEqual({
      platform: "mac",
      target: "dmg",
      skipBuild: true,
    })
    expect(parsePackageDesktopArgs([], "win32")).toEqual({
      platform: "win",
      target: "dir",
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
    expect(() => parsePackageDesktopArgs([], "linux")).toThrow(/Package macOS from a Mac/)
    expect(() => assertHostCanPackage("mac", "win32")).toThrow(/Package macOS from a Mac/)
    expect(() => assertHostCanPackage("win", "darwin")).toThrow(
      /Package Windows from a Windows machine/,
    )
  })

  it("resolves the electron-builder CLI from the desktop workspace", () => {
    expect(resolveElectronBuilderCli().endsWith("electron-builder/cli.js")).toBe(true)
  })

  it("asks electron-builder for an unsigned local artifact", () => {
    expect(electronBuilderArgs("mac", "dir")).toEqual(["--mac", "dir", "--publish", "never"])
    expect(electronBuilderArgs("mac", "dmg")).toEqual(["--mac", "dmg", "--publish", "never"])
    expect(electronBuilderArgs("win", "dir")).toEqual(["--win", "dir", "--publish", "never"])
  })
})

it.layer(NodeServices.layer)("electron-builder config", (spec) => {
  spec.effect("keeps the appId aligned with the packaged identity", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const config = yield* fs.readFileString(builderConfigPath)
      const identity = resolveAppIdentity(false)

      expect(identity).toEqual({ displayName: "Noyau", bundleId: "dev.noyau.desktop" })
      expect(config).toContain("appId: dev.noyau.desktop")
      expect(config).toContain("productName: Noyau")
      expect(config).toContain("to: server")
      expect(config).toContain("identity: null")
      expect(config).toContain("icon: assets/prod/app-icon.icns")
      expect(config).toContain('"!**/node_modules/**"')
    }),
  )
})
