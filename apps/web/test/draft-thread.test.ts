import { ThreadId, TurnId } from "@noyau/contracts/ids"
import { DateTime } from "effect"
import { describe, expect, it } from "vite-plus/test"

import { emptyComposerDraft } from "../src/lib/composer-drafts"
import {
  isDraftThreadView,
  isListableNewThreadDraft,
  newThreadDraftTitle,
  resolveDraftLatestTurn,
} from "../src/lib/draft-thread"
import {
  clearOptimisticSend,
  peekOptimisticSend,
  rememberOptimisticSend,
} from "../src/lib/thread-activity"

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

  it("stays off the draft composer after create remounts onto the new Thread", () => {
    rememberOptimisticSend({ threadId, startedAtMs: 1_700 })
    const send = peekOptimisticSend(threadId)
    expect(
      isDraftThreadView({
        threadId,
        latestTurn: null,
        transcriptLength: 0,
        sending: send !== null,
      }),
    ).toBe(false)
    clearOptimisticSend(threadId)
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

  it("is false when a fork has inherited transcript but no destination Turn yet", () => {
    expect(
      isDraftThreadView({
        threadId,
        latestTurn: null,
        transcriptLength: 0,
        inheritedTranscriptLength: 2,
        sending: false,
      }),
    ).toBe(false)
  })
})

describe("isListableNewThreadDraft", () => {
  it("is false for an empty composer", () => {
    expect(isListableNewThreadDraft(emptyComposerDraft)).toBe(false)
  })

  it("is true once the composer has text or images", () => {
    expect(isListableNewThreadDraft({ text: "Fix the sidebar", images: [] })).toBe(true)
    expect(
      isListableNewThreadDraft({
        text: "",
        images: [{ upload: { name: "shot.png" } }],
      }),
    ).toBe(true)
  })
})

describe("newThreadDraftTitle", () => {
  it("seeds the sidebar label from the first prompt line", () => {
    expect(newThreadDraftTitle({ text: "  Fix the sidebar draft  ", images: [] })).toBe(
      "Fix the sidebar draft",
    )
  })

  it("uses the first image name when the composer is images-only", () => {
    expect(
      newThreadDraftTitle({
        text: "",
        images: [{ upload: { name: "shot.png" } }],
      }),
    ).toBe("shot.png")
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
