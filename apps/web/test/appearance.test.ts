import { describe, expect, it } from "vite-plus/test"

import { parseAppearancePreference, resolveAppearance } from "../src/lib/appearance"

describe("appearance", () => {
  it.each(["system", "light", "dark"] as const)("parses the %s preference", (preference) => {
    expect(parseAppearancePreference(preference)).toBe(preference)
  })

  it("falls back to system for missing or unknown preferences", () => {
    expect(parseAppearancePreference(null)).toBe("system")
    expect(parseAppearancePreference("sepia")).toBe("system")
  })

  it("resolves system preference against the current OS appearance", () => {
    expect(resolveAppearance("system", true)).toBe("dark")
    expect(resolveAppearance("system", false)).toBe("light")
    expect(resolveAppearance("light", true)).toBe("light")
    expect(resolveAppearance("dark", false)).toBe("dark")
  })
})
