// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vite-plus/test"

import {
  COLLAPSED_PAGE_TITLEBAR_INSET_CLASS,
  MACOS_TRAFFIC_LIGHTS_LEFT_INSET,
  macosDesktopControlsStyle,
  NARROW_PAGE_TITLEBAR_INSET_CLASS,
  SIDEBAR_TITLEBAR_INSET_CLASS,
} from "../src/lib/desktop-titlebar"

const originalUserAgent = navigator.userAgent
const originalPlatform = navigator.platform

afterEach(() => {
  Object.defineProperty(window, "noyauDesktop", {
    configurable: true,
    value: undefined,
  })
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: originalUserAgent,
  })
  Object.defineProperty(navigator, "platform", {
    configurable: true,
    value: originalPlatform,
  })
})

const stubNavigator = (input: { platform: string; userAgent: string }) => {
  Object.defineProperty(navigator, "platform", {
    configurable: true,
    value: input.platform,
  })
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: input.userAgent,
  })
}

describe("desktop titlebar chrome", () => {
  it("reserves 90px for macOS traffic lights, not a Tailwind padding override", () => {
    expect(MACOS_TRAFFIC_LIGHTS_LEFT_INSET).toBe("90px")
    expect(SIDEBAR_TITLEBAR_INSET_CLASS).toBe("pl-[var(--desktop-titlebar-content-left)]")
    expect(COLLAPSED_PAGE_TITLEBAR_INSET_CLASS).toContain(
      "pl-[var(--desktop-titlebar-content-left)]",
    )
    expect(NARROW_PAGE_TITLEBAR_INSET_CLASS).toContain("pl-[var(--desktop-titlebar-content-left)]")
  })

  it("sets the macOS inset on the sidebar wrapper even without the preload bridge", () => {
    stubNavigator({
      platform: "MacIntel",
      userAgent: "Mozilla/5.0 (Macintosh) Electron/38.0.0 Chrome/140.0.0.0",
    })

    expect(macosDesktopControlsStyle()).toEqual({
      "--desktop-controls-left": "90px",
    })
  })

  it("leaves the web layout alone outside Electron", () => {
    stubNavigator({
      platform: "MacIntel",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15",
    })

    expect(macosDesktopControlsStyle()).toEqual({})
  })
})
