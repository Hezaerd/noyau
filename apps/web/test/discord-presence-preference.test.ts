import { describe, expect, it } from "vite-plus/test"

import { parseDiscordPresenceEnabled } from "../src/lib/discord-presence-preference"

describe("discord presence preference", () => {
  it("defaults to on and only treats off as disabled", () => {
    expect(parseDiscordPresenceEnabled(null)).toBe(true)
    expect(parseDiscordPresenceEnabled("")).toBe(true)
    expect(parseDiscordPresenceEnabled("on")).toBe(true)
    expect(parseDiscordPresenceEnabled("off")).toBe(false)
    expect(parseDiscordPresenceEnabled("false")).toBe(true)
  })
})
