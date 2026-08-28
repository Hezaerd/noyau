import { ProjectId, ThreadId, TurnId } from "@noyau/contracts/ids"
import { ThreadShell } from "@noyau/contracts/shell"
import type { DateTime } from "effect"
import { Schema } from "effect"
import { describe, expect, it } from "vite-plus/test"

import { partitionThreadsForSidebar, sortThreadsForSidebar } from "../src/lib/thread-sidebar-sort"

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

  it("keeps pinned Threads above unpinned ones", () => {
    const sorted = sortThreadsForSidebar(
      [
        { id: "oldest", createdAt: utc("2026-03-09T08:00:00.000Z") },
        { id: "newest", createdAt: utc("2026-03-09T12:00:00.000Z") },
        { id: "middle", createdAt: utc("2026-03-09T10:00:00.000Z") },
      ],
      new Map([["oldest", Date.parse("2026-03-09T20:00:00.000Z")]]),
    )

    expect(sorted.map((thread) => thread.id)).toEqual(["oldest", "newest", "middle"])
  })

  it("orders pinned Threads by most recent pin first", () => {
    const sorted = sortThreadsForSidebar(
      [
        { id: "first-pin", createdAt: utc("2026-03-09T08:00:00.000Z") },
        { id: "second-pin", createdAt: utc("2026-03-09T12:00:00.000Z") },
        { id: "unpinned", createdAt: utc("2026-03-09T14:00:00.000Z") },
      ],
      new Map([
        ["first-pin", Date.parse("2026-03-09T15:00:00.000Z")],
        ["second-pin", Date.parse("2026-03-09T16:00:00.000Z")],
      ]),
    )

    expect(sorted.map((thread) => thread.id)).toEqual(["second-pin", "first-pin", "unpinned"])
  })
})

describe("partitionThreadsForSidebar", () => {
  it("keeps pinned Threads in the active block and recedes settled ones", () => {
    const nowMs = Date.parse("2026-08-25T12:00:00.000Z")
    const staleIso = "2026-08-20T12:00:00.000Z"
    const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
    const turnId = TurnId.make("30000000-0000-4000-8000-000000000001")
    const freshId = ThreadId.make("20000000-0000-4000-8000-000000000001")
    const staleId = ThreadId.make("20000000-0000-4000-8000-000000000002")
    const pinnedId = ThreadId.make("20000000-0000-4000-8000-000000000003")
    const explicitId = ThreadId.make("20000000-0000-4000-8000-000000000004")
    const makeShell = (
      id: ThreadId,
      createdAt: string,
      extra: Partial<(typeof ThreadShell)["Encoded"]> = {},
    ) =>
      Schema.decodeSync(ThreadShell)({
        id,
        projectId,
        title: "Thread",
        provider: "cursor",
        modelSelection: null,
        runtimeMode: "full-access",
        status: "active",
        latestTurn: {
          turnId,
          state: "completed",
          requestedAt: createdAt,
          startedAt: createdAt,
          completedAt: createdAt,
        },
        sessionStatus: "ready",
        lastError: null,
        createdAt,
        updatedAt: staleIso,
        ...extra,
      })
    const { active, settled } = partitionThreadsForSidebar(
      [
        makeShell(freshId, "2026-08-25T11:00:00.000Z"),
        makeShell(staleId, staleIso),
        makeShell(pinnedId, staleIso),
        makeShell(explicitId, "2026-08-25T10:00:00.000Z", { settledOverride: "settled" }),
      ],
      {
        pins: new Map([[pinnedId, nowMs]]),
        nowMs,
        autoSettleAfterDays: 3,
        autoSettleOnMerge: true,
        changeRequestStateOf: () => null,
      },
    )

    expect(active.map((thread) => thread.id)).toEqual([pinnedId, freshId])
    expect(settled.map((thread) => thread.id)).toEqual([explicitId, staleId])
  })
})
