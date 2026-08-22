import { TranscriptItem } from "@noyau/protocol/entities/transcript"
import { ThreadId, TurnId } from "@noyau/protocol/ids"
import { Schema } from "effect"
import { describe, expect, it } from "vite-plus/test"

import { transcriptRowId } from "../src/lib/thread-transcript"
import {
  clipTurnMinimapMarkdown,
  compactTurnMinimapPreview,
  deriveTurnMinimapItems,
  trimTurnMinimapPreview,
  resolveTurnMinimapHasPersistentGutter,
  resolveTurnMinimapHeightStyle,
  resolveTurnMinimapHitStripWidth,
  resolveTurnMinimapIndexFromPointer,
  resolveTurnMinimapInteractiveWidth,
  resolveTurnMinimapTopPercent,
  turnMinimapItemIsInView,
} from "../src/lib/thread-turn-minimap"

const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const firstTurn = TurnId.make("40000000-0000-4000-8000-000000000001")
const secondTurn = TurnId.make("40000000-0000-4000-8000-000000000002")

const decode = Schema.decodeSync(TranscriptItem)

const user = (turnId: TurnId, text: string) =>
  decode({
    _tag: "transcript.user",
    threadId,
    turnId,
    text,
  })

const assistant = (turnId: TurnId, text: string) =>
  decode({
    _tag: "transcript.assistant",
    threadId,
    turnId,
    text,
  })

describe("thread turn minimap", () => {
  it("compacts preview text and drops empty bodies", () => {
    expect(compactTurnMinimapPreview("  hello\n\nworld  ")).toBe("hello world")
    expect(compactTurnMinimapPreview("   ")).toBeNull()
    expect(compactTurnMinimapPreview(undefined)).toBeNull()
  })

  it("trims markdown without collapsing fences or emphasis", () => {
    expect(trimTurnMinimapPreview("  **dans** le composer  ")).toBe("**dans** le composer")
    expect(trimTurnMinimapPreview("```ts\nconst ready = true\n```")).toBe(
      "```ts\nconst ready = true\n```",
    )
    expect(trimTurnMinimapPreview("   ")).toBeNull()
  })

  it("clips long markdown so the rail preview stays cheap to highlight", () => {
    const lines = Array.from({ length: 20 }, (_, index) => `ligne ${String(index + 1)}`)
    expect(clipTurnMinimapMarkdown(lines.join("\n")).split("\n")).toHaveLength(12)
    expect(clipTurnMinimapMarkdown("a".repeat(900))).toHaveLength(800)
  })

  it("builds one rail item per user Turn and keeps the last assistant text", () => {
    const items = deriveTurnMinimapItems([
      user(firstTurn, "Premier\nprompt"),
      assistant(firstTurn, "Réponse A"),
      decode({
        _tag: "transcript.tool",
        threadId,
        turnId: firstTurn,
        toolCallId: "tool-1",
        name: "Read file",
        status: "completed",
      }),
      assistant(firstTurn, "Réponse B finale"),
      user(secondTurn, "Deuxième prompt"),
    ])

    expect(items).toEqual([
      {
        turnId: firstTurn,
        messageId: transcriptRowId(user(firstTurn, "Premier\nprompt"), 0),
        userText: "Premier\nprompt",
        assistantText: "Réponse B finale",
      },
      {
        turnId: secondTurn,
        messageId: transcriptRowId(user(secondTurn, "Deuxième prompt"), 0),
        userText: "Deuxième prompt",
        assistantText: null,
      },
    ])
  })

  it("ignores an assistant row that is not attached to the current user Turn", () => {
    expect(deriveTurnMinimapItems([assistant(firstTurn, "orpheline")])).toEqual([])
  })

  it("maps rail geometry the same way as a pointer scrub", () => {
    expect(resolveTurnMinimapHeightStyle(5)).toBe("min(32px, calc(100vh - 18rem))")
    expect(resolveTurnMinimapTopPercent(2, 5)).toBe(50)
    expect(resolveTurnMinimapTopPercent(0, 1)).toBe(0)
    expect(
      resolveTurnMinimapIndexFromPointer({
        itemCount: 101,
        railTop: 100,
        railHeight: 500,
        pointerY: 350,
      }),
    ).toBe(50)
    expect(
      resolveTurnMinimapIndexFromPointer({
        itemCount: 101,
        railTop: 100,
        railHeight: 500,
        pointerY: 999,
      }),
    ).toBe(100)
    expect(
      resolveTurnMinimapIndexFromPointer({
        itemCount: 0,
        railTop: 100,
        railHeight: 500,
        pointerY: 350,
      }),
    ).toBeNull()
  })

  it("keeps the hit strip inside the side gutter of the 3xl column", () => {
    expect(resolveTurnMinimapHasPersistentGutter(768)).toBe(false)
    expect(resolveTurnMinimapHasPersistentGutter(863)).toBe(false)
    expect(resolveTurnMinimapHasPersistentGutter(864)).toBe(true)

    expect(resolveTurnMinimapHitStripWidth(768)).toBe(0)
    expect(resolveTurnMinimapHitStripWidth(792)).toBe(0)
    expect(resolveTurnMinimapHitStripWidth(806)).toBe(7)
    expect(resolveTurnMinimapHitStripWidth(872)).toBe(40)
    expect(resolveTurnMinimapHitStripWidth(920)).toBe(40)
    expect(resolveTurnMinimapHitStripWidth(0)).toBe(0)
    expect(resolveTurnMinimapHitStripWidth(Number.NaN)).toBe(0)

    expect(resolveTurnMinimapInteractiveWidth(0, false)).toBe(0)
    expect(resolveTurnMinimapInteractiveWidth(14, false)).toBe(14)
    expect(resolveTurnMinimapInteractiveWidth(0, true)).toBe("22rem")
  })

  it("treats a Turn as in view when its user row or any of its transcript rows is visible", () => {
    const item = deriveTurnMinimapItems([user(firstTurn, "Prompt")])[0]
    if (item === undefined) {
      throw new Error("expected a minimap item")
    }

    expect(turnMinimapItemIsInView(item, [])).toBe(false)
    expect(turnMinimapItemIsInView(item, [item.messageId])).toBe(true)
    expect(turnMinimapItemIsInView(item, [`transcript.assistant:${firstTurn}:3`])).toBe(true)
    expect(turnMinimapItemIsInView(item, ["transcript.user:other-turn"])).toBe(false)
  })
})
