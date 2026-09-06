import { describe, expect, it } from "vitest"

import {
  getTitleBarOverlayOptions,
  getWindowBackgroundColor,
  getWindowTitleBarOptions,
} from "./window-chrome"

describe("window chrome", () => {
  it("uses opaque theme-correct titlebar surfaces with contrasting symbols", () => {
    const light = getTitleBarOverlayOptions(false)
    const dark = getTitleBarOverlayOptions(true)

    expect(light.color).toBe(getWindowBackgroundColor(false))
    expect(dark.color).toBe(getWindowBackgroundColor(true))
    expect(light.color).toBe("#f5f4fb")
    expect(dark.color).toBe("#0f0f13")
    expect(light.symbolColor).toBe("#1c1b26")
    expect(dark.symbolColor).toBe("#f8fafc")
  })

  it("keeps the macOS titlebar path separate from overlay controls", () => {
    expect(getWindowTitleBarOptions("darwin", false)).toEqual({
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 16, y: 18 },
    })
    expect(getWindowTitleBarOptions("win32", true).titleBarOverlay).toEqual(
      getTitleBarOverlayOptions(true),
    )
  })
})
