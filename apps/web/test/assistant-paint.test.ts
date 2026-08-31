import { ThreadId, TurnId } from "@noyau/contracts/ids"
import { describe, expect, it } from "vite-plus/test"

import {
  clearAssistantPaint,
  getAssistantPaintTarget,
  presentedAssistantText,
  pushAssistantLive,
  resolvePaintedAssistantText,
} from "../src/lib/assistant-paint"

const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const turnId = TurnId.make("30000000-0000-4000-8000-000000000001")
const otherTurn = TurnId.make("30000000-0000-4000-8000-000000000002")

describe("assistant paint", () => {
  it("keeps journal text when live is missing or for another Turn", () => {
    expect(resolvePaintedAssistantText("journal", undefined, threadId, turnId)).toBe("journal")
    expect(
      resolvePaintedAssistantText(
        "journal",
        { threadId, turnId: otherTurn, text: "live" },
        threadId,
        turnId,
      ),
    ).toBe("journal")
  })

  it("uses the live snapshot when it is ahead of the journal", () => {
    expect(
      resolvePaintedAssistantText("Bon", { threadId, turnId, text: "Bonjour" }, threadId, turnId),
    ).toBe("Bonjour")
    expect(
      resolvePaintedAssistantText("Bonjour", { threadId, turnId, text: "Bon" }, threadId, turnId),
    ).toBe("Bonjour")
  })

  it("paints only the remainder after assistant rows already flushed past a tool", () => {
    const flushed = "Address bar first. "
    expect(
      resolvePaintedAssistantText(
        "",
        { threadId, turnId, text: `${flushed}There's a circular import.` },
        threadId,
        turnId,
        flushed,
      ),
    ).toBe("There's a circular import.")
    expect(
      resolvePaintedAssistantText(
        "There's a circular",
        { threadId, turnId, text: `${flushed}There's a circular import.` },
        threadId,
        turnId,
        flushed,
      ),
    ).toBe("There's a circular import.")
    expect(
      resolvePaintedAssistantText(
        "",
        { threadId, turnId, text: flushed },
        threadId,
        turnId,
        flushed,
      ),
    ).toBe("")
    expect(
      resolvePaintedAssistantText(
        "There's a circular import.",
        { threadId, turnId, text: "unrelated live snapshot" },
        threadId,
        turnId,
        flushed,
      ),
    ).toBe("There's a circular import.")
    expect(
      resolvePaintedAssistantText(
        `${flushed}There's a circular import.`,
        undefined,
        threadId,
        turnId,
        flushed,
      ),
    ).toBe("There's a circular import.")
  })

  it("strips a trailing replay of earlier assistant rows from the last paragraph", () => {
    const first = "Address bar will call the preview RPCs first. "
    const second = "There's a circular import. "
    const prefix = `${first}${second}`
    const recap = `Slice 3 wires the address bar. ${prefix}`
    expect(presentedAssistantText(prefix, prefix)).toBe("")
    expect(presentedAssistantText(recap, prefix)).toBe("Slice 3 wires the address bar. ")
    expect(
      resolvePaintedAssistantText(
        recap,
        { threadId, turnId, text: recap },
        threadId,
        turnId,
        prefix,
      ),
    ).toBe("Slice 3 wires the address bar. ")
  })

  it("replaces the live store without duplicating the same snapshot", () => {
    clearAssistantPaint()
    pushAssistantLive({ threadId, turnId, text: "Bon" })
    pushAssistantLive({ threadId, turnId, text: "Bon" })
    pushAssistantLive({ threadId, turnId, text: "Bonjour" })
    clearAssistantPaint(threadId)
  })

  it("keeps the paint target identity while only the live text grows", () => {
    clearAssistantPaint()
    pushAssistantLive({ threadId, turnId, text: "Bon" })
    const first = getAssistantPaintTarget()
    pushAssistantLive({ threadId, turnId, text: "Bonjour" })
    expect(getAssistantPaintTarget()).toBe(first)
    pushAssistantLive({ threadId, turnId: otherTurn, text: "Autre" })
    const next = getAssistantPaintTarget()
    expect(next).not.toBe(first)
    expect(next).toEqual({ threadId, turnId: otherTurn })
    clearAssistantPaint(threadId)
    expect(getAssistantPaintTarget()).toBeUndefined()
  })
})
