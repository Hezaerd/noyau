import { describe, expect, it } from "vite-plus/test"

import { getDesktopPlatformClassNames } from "../src/lib/desktop-bridge"

describe("desktop bridge", () => {
  it.each([
    ["MacIntel", ["electron", "electron-macos"]],
    ["Win32", ["electron", "electron-windows"]],
    ["Linux x86_64", ["electron", "electron-linux"]],
  ] as const)("maps %s to renderer platform classes", (platform, classNames) => {
    expect(getDesktopPlatformClassNames(platform)).toEqual(classNames)
  })
})
