import { describe, expect, it } from "vitest"

import { shouldCatchUpTranscriptOnOpen } from "../src/lib/thread-transcript-catch-up"

describe("shouldCatchUpTranscriptOnOpen", () => {
  it("is false for a draft Thread", () => {
    expect(
      shouldCatchUpTranscriptOnOpen({
        threadId: undefined,
        loading: false,
        snapshotThreadId: undefined,
      }),
    ).toBe(false)
  })

  it("is false while the Thread is still loading", () => {
    expect(
      shouldCatchUpTranscriptOnOpen({
        threadId: "thread-1",
        loading: true,
        snapshotThreadId: "thread-1",
      }),
    ).toBe(false)
  })

  it("is false while the painted snapshot belongs to another Thread", () => {
    expect(
      shouldCatchUpTranscriptOnOpen({
        threadId: "thread-2",
        loading: false,
        snapshotThreadId: "thread-1",
      }),
    ).toBe(false)
  })

  it("is true when the matching Thread snapshot is ready", () => {
    expect(
      shouldCatchUpTranscriptOnOpen({
        threadId: "thread-1",
        loading: false,
        snapshotThreadId: "thread-1",
      }),
    ).toBe(true)
  })
})
