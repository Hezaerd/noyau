import { describe, expect, it } from "vitest"

import { nextVisitedAtMs, parseThreadVisits, serializeThreadVisits } from "../src/lib/thread-visits"

describe("thread visits", () => {
  it("keeps only finite ISO instants", () => {
    expect(parseThreadVisits(null)).toEqual(new Map())
    expect(parseThreadVisits("")).toEqual(new Map())
    expect(parseThreadVisits("{")).toEqual(new Map())
    expect(
      parseThreadVisits(
        JSON.stringify({
          "20000000-0000-4000-8000-000000000001": "2026-08-23T12:00:00.000Z",
          "20000000-0000-4000-8000-000000000002": "not-a-date",
        }),
      ),
    ).toEqual(
      new Map([["20000000-0000-4000-8000-000000000001", Date.parse("2026-08-23T12:00:00.000Z")]]),
    )
  })

  it("round-trips valid visits as ISO strings", () => {
    const visits = new Map([
      ["20000000-0000-4000-8000-000000000001", Date.parse("2026-08-23T12:00:00.000Z")],
    ])
    expect(parseThreadVisits(serializeThreadVisits(visits))).toEqual(visits)
  })

  it("never moves lastVisitedAt backwards", () => {
    expect(nextVisitedAtMs(undefined, Date.parse("2026-08-23T12:00:00.000Z"))).toBe(
      Date.parse("2026-08-23T12:00:00.000Z"),
    )
    expect(
      nextVisitedAtMs(
        Date.parse("2026-08-23T12:05:00.000Z"),
        Date.parse("2026-08-23T12:00:00.000Z"),
      ),
    ).toBe(Date.parse("2026-08-23T12:05:00.000Z"))
    expect(nextVisitedAtMs(1_000, Number.NaN)).toBe(1_000)
  })
})
