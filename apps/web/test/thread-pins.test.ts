import { describe, expect, it } from "vite-plus/test"

import { isThreadPinned, parseThreadPins, serializeThreadPins } from "../src/lib/thread-pins"

describe("thread pins", () => {
  it("keeps only finite ISO instants", () => {
    expect(parseThreadPins(null)).toEqual(new Map())
    expect(parseThreadPins("")).toEqual(new Map())
    expect(parseThreadPins("{")).toEqual(new Map())
    expect(
      parseThreadPins(
        JSON.stringify({
          "20000000-0000-4000-8000-000000000001": "2026-08-23T12:00:00.000Z",
          "20000000-0000-4000-8000-000000000002": "not-a-date",
        }),
      ),
    ).toEqual(
      new Map([["20000000-0000-4000-8000-000000000001", Date.parse("2026-08-23T12:00:00.000Z")]]),
    )
  })

  it("round-trips valid pins as ISO strings", () => {
    const pins = new Map([
      ["20000000-0000-4000-8000-000000000001", Date.parse("2026-08-23T12:00:00.000Z")],
    ])
    expect(parseThreadPins(serializeThreadPins(pins))).toEqual(pins)
  })

  it("reports pin membership against an explicit map", () => {
    const pins = new Map([
      ["20000000-0000-4000-8000-000000000001", Date.parse("2026-08-23T12:00:00.000Z")],
    ])
    expect(isThreadPinned("20000000-0000-4000-8000-000000000001", pins)).toBe(true)
    expect(isThreadPinned("20000000-0000-4000-8000-000000000002", pins)).toBe(false)
  })
})
