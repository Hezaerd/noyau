import { describe, expect, it } from "vite-plus/test"

import {
  DEFAULT_TRANSCRIPT_PAINT_MODE,
  isTranscriptPaintMode,
  parseTranscriptPaintMode,
} from "../src/lib/transcript-paint-preference"

describe("transcript paint preference", () => {
  it("defaults to smooth and accepts only the two modes", () => {
    expect(parseTranscriptPaintMode(null)).toBe(DEFAULT_TRANSCRIPT_PAINT_MODE)
    expect(parseTranscriptPaintMode("classic")).toBe("classic")
    expect(parseTranscriptPaintMode("nope")).toBe("smooth")
    expect(isTranscriptPaintMode("smooth")).toBe(true)
    expect(isTranscriptPaintMode("instant")).toBe(false)
  })
})
