import { ProjectId, ThreadId, TurnId } from "@noyau/contracts/ids"
import { ThreadShell } from "@noyau/contracts/shell"
import type { DateTime } from "effect"
import { Schema } from "effect"
import { describe, expect, it } from "vite-plus/test"

import { partitionThreadsForSidebar, sortThreadsForSidebar } from "../src/lib/thread-sidebar-sort"

const utc = (iso: string): DateTime.Utc => Schema.decodeSync(Schema.DateTimeUtcFromString)(iso)

describe("sortThreadsForSidebar", () => {
  it("orders by listedAt, newest first", () => {
    const sorted = sortThreadsForSidebar([
      { id: "oldest", listedAt: utc("2026-03-09T08:00:00.000Z") },
      { id: "newest", listedAt: utc("2026-03-09T12:00:00.000Z") },
      { id: "middle", listedAt: utc("2026-03-09T10:00:00.000Z") },
    ])

    expect(sorted.map((thread) => thread.id)).toEqual(["newest", "middle", "oldest"])
  })

  it("ignores later activity on an older Thread", () => {
    const sorted = sortThreadsForSidebar([
      {
        id: "older",
        listedAt: utc("2026-03-09T08:00:00.000Z"),
        updatedAt: utc("2026-03-09T18:00:00.000Z"),
      },
      {
        id: "newer",
        listedAt: utc("2026-03-09T12:00:00.000Z"),
        updatedAt: utc("2026-03-09T12:00:00.000Z"),
      },
    ])

    expect(sorted.map((thread) => thread.id)).toEqual(["newer", "older"])
  })

  it("breaks listedAt ties by id", () => {
    const listedAt = utc("2026-03-09T10:00:00.000Z")
    const sorted = sortThreadsForSidebar([
      { id: "b", listedAt },
      { id: "a", listedAt },
    ])

    expect(sorted.map((thread) => thread.id)).toEqual(["a", "b"])
  })

  it("keeps pinned Threads above unpinned ones", () => {
    const sorted = sortThreadsForSidebar(
      [
        { id: "oldest", listedAt: utc("2026-03-09T08:00:00.000Z") },
        { id: "newest", listedAt: utc("2026-03-09T12:00:00.000Z") },
        { id: "middle", listedAt: utc("2026-03-09T10:00:00.000Z") },
      ],
      new Map([["oldest", Date.parse("2026-03-09T20:00:00.000Z")]]),
    )

    expect(sorted.map((thread) => thread.id)).toEqual(["oldest", "newest", "middle"])
  })

  it("orders pinned Threads by most recent pin first", () => {
    const sorted = sortThreadsForSidebar(
      [
        { id: "first-pin", listedAt: utc("2026-03-09T08:00:00.000Z") },
        { id: "second-pin", listedAt: utc("2026-03-09T12:00:00.000Z") },
        { id: "unpinned", listedAt: utc("2026-03-09T14:00:00.000Z") },
      ],
      new Map([
        ["first-pin", Date.parse("2026-03-09T15:00:00.000Z")],
        ["second-pin", Date.parse("2026-03-09T16:00:00.000Z")],
      ]),
    )

    expect(sorted.map((thread) => thread.id)).toEqual(["second-pin", "first-pin", "unpinned"])
  })

  it("places an unsettled Thread above ones that kept their listedAt", () => {
    const createdAt = utc("2026-08-10T08:00:00.000Z")
    const sorted = sortThreadsForSidebar([
      { id: "kept-place", listedAt: utc("2026-08-20T12:00:00.000Z"), createdAt },
      { id: "unsettled", listedAt: utc("2026-08-25T12:00:00.000Z"), createdAt },
    ])

    expect(sorted.map((thread) => thread.id)).toEqual(["unsettled", "kept-place"])
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
        listedAt: createdAt,
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
        changeRequestStateOf: () => null,
      },
    )

    expect(active.map((thread) => thread.id)).toEqual([pinnedId, freshId])
    expect(settled.map((thread) => thread.id)).toEqual([explicitId, staleId])
  })
})
