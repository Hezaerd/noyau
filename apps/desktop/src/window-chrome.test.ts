import { describe, expect, it } from "vite-plus/test"

import {
  getTitleBarOverlayOptions,
  getWindowBackgroundColor,
  getWindowTitleBarOptions,
} from "./window-chrome"

describe("desktop window chrome", () => {
  it("uses inset native traffic lights on macOS", () => {
    expect(getWindowTitleBarOptions("darwin", true)).toEqual({
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 16, y: 18 },
    })
  })

  it.each(["win32", "linux"] as const)("uses native window controls overlay on %s", (platform) => {
    expect(getWindowTitleBarOptions(platform, true)).toEqual({
      titleBarStyle: "hidden",
      titleBarOverlay: {
        color: "#01000000",
        height: 40,
        symbolColor: "#f8fafc",
      },
    })
  })

  it("adapts the window and native symbols to light appearance", () => {
    expect(getWindowBackgroundColor(false)).toBe("#ffffff")
    expect(getTitleBarOverlayOptions(false)).toEqual({
      color: "#01000000",
      height: 40,
      symbolColor: "#1f2937",
    })
  })
})
