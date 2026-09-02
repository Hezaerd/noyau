// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import {
  applyAppearance,
  parseAppearancePreference,
  readStoredAppearancePreference,
  resolveAppearance,
} from "../src/lib/appearance"

afterEach(() => {
  document.documentElement.className = ""
  document.documentElement.style.colorScheme = ""
  vi.restoreAllMocks()
})

describe("appearance", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("falls back to system for invalid or unavailable stored values", () => {
    expect(parseAppearancePreference("sepia")).toBe("system")
    window.localStorage.setItem("noyau:appearance", "dark")
    expect(readStoredAppearancePreference()).toBe("dark")

    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable")
    })
    expect(readStoredAppearancePreference()).toBe("system")
  })

  it("resolves and applies the persisted preference before renderer content", () => {
    expect(resolveAppearance("dark", false)).toBe("dark")
    expect(resolveAppearance("light", true)).toBe("light")
    expect(resolveAppearance("system", true)).toBe("dark")

    applyAppearance("light", false)
    expect(document.documentElement.classList.contains("dark")).toBe(false)
    expect(document.documentElement.style.colorScheme).toBe("light")
  })
})
