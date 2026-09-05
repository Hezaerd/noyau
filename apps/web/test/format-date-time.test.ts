import { describe, expect, it } from "vitest"

import { formatDateTime } from "../src/lib/format-date-time"

describe("formatDateTime", () => {
  it("uses the runtime locale and timezone for valid timestamps", () => {
    const value = "2025-01-15T12:34:56.000Z"
    const expected = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value))

    expect(formatDateTime(value)).toBe(expected)
  })

  it("preserves invalid timestamp strings", () => {
    expect(formatDateTime("not-a-timestamp")).toBe("not-a-timestamp")
  })
})
