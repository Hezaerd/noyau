import { describe, expect, it } from "vite-plus/test"

import { parseThreadEnvModePreference } from "../src/lib/thread-env-mode-preference"

describe("thread env mode preference", () => {
  it("defaults to Checkout courant and ignores unknown values", () => {
    expect(parseThreadEnvModePreference(null)).toBe("local")
    expect(parseThreadEnvModePreference("")).toBe("local")
    expect(parseThreadEnvModePreference("local")).toBe("local")
    expect(parseThreadEnvModePreference("worktree")).toBe("worktree")
    expect(parseThreadEnvModePreference("workspace")).toBe("local")
  })
})
