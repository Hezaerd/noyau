import { ProjectId, ThreadId, TurnId } from "@noyau/contracts/ids"
import { DateTime } from "effect"
import { describe, expect, it } from "vite-plus/test"

import {
  createDraftThreadForNewRoute,
  resetDraftThreadNewRouteCreates,
  type CreateDraftThreadInput,
  type CreateDraftThreadResult,
} from "../src/lib/create-draft-thread"
import { isDraftThreadView, resolveDraftLatestTurn } from "../src/lib/draft-thread"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const at = DateTime.makeUnsafe("2026-08-28T12:00:00.000Z")

describe("isDraftThreadView", () => {
  it("is true for the unsaved /thread/new route", () => {
    expect(
      isDraftThreadView({
        threadId: undefined,
        latestTurn: undefined,
        transcriptLength: 0,
        sending: false,
      }),
    ).toBe(true)
  })

  it("is true for a persisted Thread that still has no Turn", () => {
    expect(
      isDraftThreadView({
        threadId,
        latestTurn: null,
        transcriptLength: 0,
        sending: false,
      }),
    ).toBe(true)
  })

  it("is false while the first send is in flight", () => {
    expect(
      isDraftThreadView({
        threadId,
        latestTurn: null,
        transcriptLength: 0,
        sending: true,
      }),
    ).toBe(false)
  })

  it("is false while a persisted Thread snapshot has not arrived", () => {
    expect(
      isDraftThreadView({
        threadId,
        latestTurn: undefined,
        transcriptLength: 0,
        sending: false,
      }),
    ).toBe(false)
  })

  it("is false once a Turn exists", () => {
    expect(
      isDraftThreadView({
        threadId,
        latestTurn: {
          turnId: TurnId.make("30000000-0000-4000-8000-000000000001"),
          state: "completed",
          requestedAt: at,
          startedAt: at,
          completedAt: at,
        },
        transcriptLength: 2,
        sending: false,
      }),
    ).toBe(false)
  })
})

describe("resolveDraftLatestTurn", () => {
  it("keeps an explicit null from a loaded snapshot", () => {
    expect(resolveDraftLatestTurn(null, undefined, true)).toBeNull()
  })

  it("uses the shell while the snapshot is still missing", () => {
    expect(resolveDraftLatestTurn(undefined, null, false)).toBeNull()
  })
})

describe("createDraftThreadForNewRoute", () => {
  it("reuses the in-flight create for the same Project", async () => {
    resetDraftThreadNewRouteCreates()
    let calls = 0
    const input: CreateDraftThreadInput = { projectId }
    const create = (): Promise<CreateDraftThreadResult> => {
      calls += 1
      return Promise.resolve({ ok: true, threadId })
    }

    const [first, second] = await Promise.all([
      createDraftThreadForNewRoute(input, create),
      createDraftThreadForNewRoute(input, create),
    ])

    expect(calls).toBe(1)
    expect(first).toEqual(second)
    resetDraftThreadNewRouteCreates()
  })
})
