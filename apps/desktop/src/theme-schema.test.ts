import { Effect } from "effect"
import { describe, expect, it } from "vite-plus/test"

import { decodeAppearancePreference } from "./theme-schema"

describe("desktop theme schema", () => {
  it.each(["system", "light", "dark"] as const)("decodes the %s preference", (preference) => {
    expect(Effect.runSync(decodeAppearancePreference(preference))).toBe(preference)
  })

  it("rejects unknown preferences", () => {
    expect(() => Effect.runSync(decodeAppearancePreference("sepia"))).toThrow()
  })
})
