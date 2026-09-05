import { describe, expect, it, vi } from "vitest"

import { DEFAULT_SETTINGS_PATH, navigateToSettings } from "../src/lib/settings-navigation"

describe("Settings navigation", () => {
  it("keeps a successful client-side transition in place", async () => {
    const hardNavigate = vi.fn()

    await navigateToSettings(() => Promise.resolve(), hardNavigate)

    expect(hardNavigate).not.toHaveBeenCalled()
  })

  it("falls back to a same-origin load when the client transition rejects", async () => {
    const hardNavigate = vi.fn()

    await navigateToSettings(() => Promise.reject(new Error("chunk load failed")), hardNavigate)

    expect(hardNavigate).toHaveBeenCalledWith(DEFAULT_SETTINGS_PATH)
  })
})
