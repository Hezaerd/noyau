import { Sequence } from "@noyau/protocol/ids"
import { describe, expect, it } from "vite-plus/test"

import { acceptsSequence } from "../src/lib/control-plane"

describe("control plane stream cursor", () => {
  it("accepts each sequence once and ignores duplicate or older deliveries", () => {
    const first = Sequence.make(12)
    const duplicate = Sequence.make(12)
    const older = Sequence.make(11)
    const newer = Sequence.make(13)

    expect(acceptsSequence(undefined, first)).toBe(true)
    expect(acceptsSequence(first, duplicate)).toBe(false)
    expect(acceptsSequence(first, older)).toBe(false)
    expect(acceptsSequence(first, newer)).toBe(true)
  })
})
