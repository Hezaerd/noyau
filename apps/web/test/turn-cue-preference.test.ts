import { describe, expect, it } from "vite-plus/test"

import {
  isTurnCuePreferenceDefault,
  parseTurnCueEnabled,
  parseTurnCueSound,
} from "../src/lib/turn-cue-preference"

describe("turn cue preference", () => {
  it("defaults the toggle to on and only treats off as disabled", () => {
    expect(parseTurnCueEnabled(null)).toBe(true)
    expect(parseTurnCueEnabled("")).toBe(true)
    expect(parseTurnCueEnabled("on")).toBe(true)
    expect(parseTurnCueEnabled("off")).toBe(false)
    expect(parseTurnCueEnabled("false")).toBe(true)
  })

  it("defaults the sound to Arrival and ignores unknown names", () => {
    expect(parseTurnCueSound(null)).toBe("arrival")
    expect(parseTurnCueSound("")).toBe("arrival")
    expect(parseTurnCueSound("chime")).toBe("chime")
    expect(parseTurnCueSound("toggle")).toBe("arrival")
  })

  it("treats Arrival + enabled as the restore default", () => {
    expect(isTurnCuePreferenceDefault({ enabled: true, sound: "arrival" })).toBe(true)
    expect(isTurnCuePreferenceDefault({ enabled: false, sound: "arrival" })).toBe(false)
    expect(isTurnCuePreferenceDefault({ enabled: true, sound: "chime" })).toBe(false)
  })
})
