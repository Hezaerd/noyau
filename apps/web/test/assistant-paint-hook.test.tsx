// @vitest-environment happy-dom

import { ThreadId, TurnId } from "@noyau/contracts/ids"
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vite-plus/test"

import { useAssistantPaint } from "../src/hooks/use-assistant-paint"
import { clearAssistantPaint, pushAssistantLive } from "../src/lib/assistant-paint"

const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const turnId = TurnId.make("30000000-0000-4000-8000-000000000001")

afterEach(() => {
  cleanup()
  clearAssistantPaint()
})

describe("useAssistantPaint subscriptions", () => {
  it("does not repaint historical rows when live text grows", () => {
    let renders = 0
    const { result } = renderHook(() => {
      renders += 1
      return useAssistantPaint("Already journaled", threadId, turnId, false)
    })

    expect(result.current).toBe("Already journaled")
    expect(renders).toBe(1)

    act(() => {
      pushAssistantLive({ threadId, turnId, text: "A newer live response" })
    })

    expect(result.current).toBe("Already journaled")
    expect(renders).toBe(1)
  })

  it("keeps streaming rows subscribed to live text", () => {
    let renders = 0
    const { result } = renderHook(() => {
      renders += 1
      return useAssistantPaint("", threadId, turnId, true)
    })

    act(() => {
      pushAssistantLive({ threadId, turnId, text: "Streaming response" })
    })

    expect(result.current).toBe("Streaming response")
    expect(renders).toBe(2)
  })

  it("subscribes when a journal row becomes live and detaches after it settles", () => {
    let renders = 0
    const { result, rerender } = renderHook(
      ({ journalText, streaming }: { journalText: string; streaming: boolean }) => {
        renders += 1
        return useAssistantPaint(journalText, threadId, turnId, streaming, "Already ")
      },
      { initialProps: { journalText: "Already journaled", streaming: false } },
    )

    act(() => {
      pushAssistantLive({ threadId, turnId, text: "Already live response" })
    })
    expect(renders).toBe(1)

    rerender({ journalText: "Already journaled", streaming: true })
    expect(result.current).toBe("live response")
    expect(renders).toBe(2)

    rerender({ journalText: "Already settled response", streaming: false })
    expect(result.current).toBe("settled response")
    expect(renders).toBe(3)

    act(() => {
      pushAssistantLive({ threadId, turnId, text: "Already newer live response" })
    })
    expect(result.current).toBe("settled response")
    expect(renders).toBe(3)
  })
})
