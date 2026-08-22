// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vite-plus/test"

import {
  getDesktopPlatformClassNames,
  isDesktopRuntime,
  syncDocumentDesktopChrome,
} from "../src/lib/desktop-bridge"

const originalUserAgent = navigator.userAgent

afterEach(() => {
  Object.defineProperty(window, "noyauDesktop", {
    configurable: true,
    value: undefined,
  })
  document.documentElement.className = ""
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: originalUserAgent,
  })
})

describe("desktop bridge", () => {
  it.each([
    ["MacIntel", ["electron", "electron-macos"]],
    ["darwin", ["electron", "electron-macos"]],
    ["Win32", ["electron", "electron-windows"]],
    ["win32", ["electron", "electron-windows"]],
    ["Linux x86_64", ["electron", "electron-linux"]],
    ["linux", ["electron", "electron-linux"]],
  ] as const)("maps %s to renderer platform classes", (platform, classNames) => {
    expect(getDesktopPlatformClassNames(platform)).toEqual(classNames)
  })

  it("detects Electron from the user agent when the preload bridge is missing", () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Macintosh) Electron/38.0.0 Chrome/140.0.0.0",
    })

    expect(isDesktopRuntime()).toBe(true)
  })

  it("applies macos chrome classes from the user agent without noyauDesktop", () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Macintosh) Electron/38.0.0 Chrome/140.0.0.0",
    })
    Object.defineProperty(navigator, "platform", {
      configurable: true,
      value: "MacIntel",
    })

    const restore = syncDocumentDesktopChrome()
    expect(document.documentElement.classList.contains("electron")).toBe(true)
    expect(document.documentElement.classList.contains("electron-macos")).toBe(true)
    restore()
    expect(document.documentElement.classList.contains("electron-macos")).toBe(false)
  })

  it("does not tag a regular browser session as Electron", () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15",
    })

    expect(isDesktopRuntime()).toBe(false)
    expect(syncDocumentDesktopChrome()).toBeTypeOf("function")
    expect(document.documentElement.classList.contains("electron")).toBe(false)
  })
})
