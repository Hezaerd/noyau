import { describe, expect, it } from "vite-plus/test"

import {
  resolveAppIdentity,
  resolveElectronBinaryPath,
  resolveMacBundlePaths,
} from "./electron-launcher.mjs"

describe("electron launcher", () => {
  it("brands development as Noyau (Dev) with a checkout-scoped bundle id", () => {
    const identity = resolveAppIdentity(true)

    expect(identity.displayName).toBe("Noyau (Dev)")
    expect(identity.bundleId.startsWith("dev.noyau.desktop.dev.")).toBe(true)
  })

  it("brands packaged-like launches as Noyau", () => {
    expect(resolveAppIdentity(false)).toEqual({
      displayName: "Noyau",
      bundleId: "dev.noyau.desktop",
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
    const calls = []
    const electronPath = resolveElectronBinaryPath(
      () => (specifier) => {
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
