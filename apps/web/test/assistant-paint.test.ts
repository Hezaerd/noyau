import { ThreadId, TurnId } from "@noyau/contracts/ids"
import { describe, expect, it } from "vite-plus/test"

import {
  clearAssistantPaint,
  createFramePainter,
  getAssistantPaintTarget,
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

  it("commits immediately in classic mode and once per frame in smooth mode", () => {
    const frames: Array<() => void> = []
    const commits: Array<string> = []
    const painter = createFramePainter({
      mode: "smooth",
      schedule: (callback) => {
        frames.push(callback)
        return frames.length
      },
      cancel: () => {
        frames.length = 0
      },
      commit: (text) => {
        commits.push(text)
      },
    })

    painter.push("B")
    painter.push("Bon")
    painter.push("Bonjour")
    expect(commits).toEqual([])
    expect(frames).toHaveLength(1)
    frames[0]?.()
    expect(commits).toEqual(["Bonjour"])

    const immediate: Array<string> = []
    const classic = createFramePainter({
      mode: "classic",
      schedule: () => 0,
      cancel: () => undefined,
      commit: (text) => {
        immediate.push(text)
      },
    })
    classic.push("B")
    classic.push("Bonjour")
    expect(immediate).toEqual(["B", "Bonjour"])
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
