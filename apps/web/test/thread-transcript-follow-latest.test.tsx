// @vitest-environment happy-dom

import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { ThreadTranscriptFollowLatest } from "../src/components/thread/ThreadTranscriptFollowLatest"

const scrollToEnd = vi.fn(() => true)

vi.mock("@/components/ui/message-scroller", () => ({
  useMessageScroller: () => ({
    scrollToEnd,
    scrollToMessage: vi.fn(() => true),
    scrollToStart: vi.fn(() => true),
  }),
}))

afterEach(() => {
  cleanup()
})

describe("ThreadTranscriptFollowLatest", () => {
  beforeEach(() => {
    scrollToEnd.mockClear()
  })

  it("does not scroll while followLatestKey is idle", () => {
    render(<ThreadTranscriptFollowLatest followLatestKey={0} />)
    expect(scrollToEnd).not.toHaveBeenCalled()
  })

  it("scrolls to the end when followLatestKey advances", () => {
    const { rerender } = render(<ThreadTranscriptFollowLatest followLatestKey={0} />)
    expect(scrollToEnd).not.toHaveBeenCalled()

    rerender(<ThreadTranscriptFollowLatest followLatestKey={1} />)
    expect(scrollToEnd).toHaveBeenCalledOnce()

    rerender(<ThreadTranscriptFollowLatest followLatestKey={2} />)
    expect(scrollToEnd).toHaveBeenCalledTimes(2)
  })
})
