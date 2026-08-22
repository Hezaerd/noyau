import { describe, expect, it } from "@effect/vitest"

import {
  resolveAppIdentity,
  resolveElectronBinaryPath,
  resolveMacBundlePaths,
} from "./electron-launcher.ts"

describe("electron launcher", () => {
  it("brands development with one stable bundle id", () => {
    expect(resolveAppIdentity("development")).toEqual({
      displayName: "Noyau (Dev)",
      bundleId: "dev.noyau.desktop.dev",
    })
  })

  it("brands latest and nightly from the release channel", () => {
    expect(resolveAppIdentity("latest")).toEqual({
      displayName: "Noyau",
      bundleId: "dev.noyau.desktop",
    })
    expect(resolveAppIdentity("nightly")).toEqual({
      displayName: "Noyau (Nightly)",
      bundleId: "dev.noyau.desktop.nightly",
    })
  })

  it("keeps the native Electron executable inside the branded macOS bundle", () => {
    const paths = resolveMacBundlePaths("/repo/apps/desktop/.electron-runtime/Noyau (Dev).app")

    expect(paths.electronBinaryPath).toBe(
      "/repo/apps/desktop/.electron-runtime/Noyau (Dev).app/Contents/MacOS/Electron",
    )
    expect(paths.infoPlistPath).toBe(
      "/repo/apps/desktop/.electron-runtime/Noyau (Dev).app/Contents/Info.plist",
    )
  })

  it("resolves the stock Electron binary from the package entrypoint", () => {
    const calls: Array<string> = []
    const electronPath = resolveElectronBinaryPath(
      () => (specifier: string) => {
        calls.push(`require:${specifier}`)
        return "/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
      },
      import.meta.url,
    )

    expect(electronPath).toBe(
      "/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
    )
    expect(calls).toEqual(["require:electron"])
  })
})
