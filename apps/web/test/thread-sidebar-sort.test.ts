import type { DateTime } from "effect"
import { Schema } from "effect"
import { describe, expect, it } from "vite-plus/test"

import { sortThreadsForSidebar } from "../src/lib/thread-sidebar-sort"

const utc = (iso: string): DateTime.Utc => Schema.decodeSync(Schema.DateTimeUtcFromString)(iso)

describe("sortThreadsForSidebar", () => {
  it("orders by creation time, newest first", () => {
    const sorted = sortThreadsForSidebar([
      { id: "oldest", createdAt: utc("2026-03-09T08:00:00.000Z") },
      { id: "newest", createdAt: utc("2026-03-09T12:00:00.000Z") },
      { id: "middle", createdAt: utc("2026-03-09T10:00:00.000Z") },
    ])

    expect(sorted.map((thread) => thread.id)).toEqual(["newest", "middle", "oldest"])
  })

  it("ignores later activity on an older Thread", () => {
    const sorted = sortThreadsForSidebar([
      {
        id: "older",
        createdAt: utc("2026-03-09T08:00:00.000Z"),
        updatedAt: utc("2026-03-09T18:00:00.000Z"),
      },
      {
        id: "newer",
        createdAt: utc("2026-03-09T12:00:00.000Z"),
        updatedAt: utc("2026-03-09T12:00:00.000Z"),
      },
    ])

    expect(sorted.map((thread) => thread.id)).toEqual(["newer", "older"])
  })

  it("breaks creation-time ties by id", () => {
    const createdAt = utc("2026-03-09T10:00:00.000Z")
    const sorted = sortThreadsForSidebar([
      { id: "b", createdAt },
      { id: "a", createdAt },
    ])

    expect(sorted.map((thread) => thread.id)).toEqual(["a", "b"])
  })
})
