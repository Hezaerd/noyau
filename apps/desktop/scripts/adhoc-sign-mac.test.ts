import { describe, expect, it } from "@effect/vitest"

import {
  adhocSignMacArgs,
  parseAdhocSignMacArgs,
  resolveMacAppBundlePath,
  shouldAdhocSignMac,
  verifyMacAppArgs,
} from "./adhoc-sign-mac.ts"

describe("adhoc sign mac", () => {
  it("only signs darwin packs", () => {
    expect(shouldAdhocSignMac("darwin")).toBe(true)
    expect(shouldAdhocSignMac("win32")).toBe(false)
    expect(shouldAdhocSignMac("linux")).toBe(false)
  })

  it("resolves the .app path from the afterPack context", () => {
    expect(resolveMacAppBundlePath("release/mac-arm64", "Noyau (Nightly)")).toBe(
      "release/mac-arm64/Noyau (Nightly).app",
    )
    expect(resolveMacAppBundlePath("release/mac-arm64/", "Noyau")).toBe(
      "release/mac-arm64/Noyau.app",
    )
    expect(() => resolveMacAppBundlePath("", "Noyau")).toThrow(/required/)
    expect(() => resolveMacAppBundlePath("release/mac-arm64", "")).toThrow(/required/)
  })

  it("replaces the leftover Electron signature and verifies the sealed bundle", () => {
    expect(adhocSignMacArgs("/tmp/Noyau (Nightly).app")).toEqual([
      "--force",
      "--deep",
      "--sign",
      "-",
      "/tmp/Noyau (Nightly).app",
    ])
    expect(verifyMacAppArgs("/tmp/Noyau (Nightly).app")).toEqual([
      "--verify",
      "--deep",
      "--strict",
      "/tmp/Noyau (Nightly).app",
    ])
  })

  it("requires --app", () => {
    expect(parseAdhocSignMacArgs(["--app", "/tmp/Noyau.app"])).toEqual({ app: "/tmp/Noyau.app" })
    expect(() => parseAdhocSignMacArgs([])).toThrow(/--app requires a value/)
    expect(() => parseAdhocSignMacArgs(["--app"])).toThrow(/--app requires a value/)
    expect(() => parseAdhocSignMacArgs(["--unknown"])).toThrow(/Unknown adhoc-sign flag/)
  })
})
