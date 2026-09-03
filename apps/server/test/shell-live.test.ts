import { ApprovalRequestId, ThreadId, ToolCallId, TurnId } from "@noyau/contracts/ids"
import {
  ThreadTitleSeeded,
  ThreadTranscriptAppended,
  ThreadTurnEnded,
  ThreadTurnStarted,
} from "@noyau/contracts/thread/events"
import { coalescePersistedForShell, threadEventTouchesShell } from "@noyau/server/shell-live"
import { describe, expect, it } from "vitest"

const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const turnId = TurnId.make("30000000-0000-4000-8000-000000000001")

describe("threadEventTouchesShell", () => {
  it("keeps turn, title and settlement on the shell", () => {
    expect(
      threadEventTouchesShell(ThreadTurnStarted.make({ threadId, turnId, text: "Travaille" })),
    ).toBe(true)
    expect(
      threadEventTouchesShell(ThreadTitleSeeded.make({ threadId, title: "Nouveau titre" })),
    ).toBe(true)
    expect(
      threadEventTouchesShell(ThreadTurnEnded.make({ threadId, turnId, state: "completed" })),
    ).toBe(true)
  })

  it("drops assistant, tool and plan appends", () => {
    expect(
      threadEventTouchesShell(
        ThreadTranscriptAppended.make({
          item: { _tag: "transcript.assistant", threadId, turnId, text: "hello" },
        }),
      ),
    ).toBe(false)
    expect(
      threadEventTouchesShell(
        ThreadTranscriptAppended.make({
          item: {
            _tag: "transcript.plan",
            threadId,
            turnId,
            markdown: "- [ ] Work",
          },
        }),
      ),
    ).toBe(false)
    expect(
      threadEventTouchesShell(
        ThreadTranscriptAppended.make({
          item: {
            _tag: "transcript.tool",
            threadId,
            turnId,
            toolCallId: ToolCallId.make("tool-1"),
            name: "Read",
            status: "completed",
          },
        }),
      ),
    ).toBe(false)
  })

  it("keeps pending permission and user-input on the shell", () => {
    expect(
      threadEventTouchesShell(
        ThreadTranscriptAppended.make({
          item: {
            _tag: "transcript.permission",
            threadId,
            turnId,
            requestId: ApprovalRequestId.make("permission-1"),
            status: "pending",
          },
        }),
      ),
    ).toBe(true)
    expect(
      threadEventTouchesShell(
        ThreadTranscriptAppended.make({
          item: {
            _tag: "transcript.user-input",
            threadId,
            turnId,
            requestId: ApprovalRequestId.make("ask-1"),
            status: "pending",
          },
        }),
      ),
    ).toBe(true)
  })
})

describe("coalescePersistedForShell", () => {
  it("keeps the last shell-touching event per Thread and drops streaming", () => {
    const started = ThreadTurnStarted.make({ threadId, turnId, text: "Travaille" })
    const assistant = ThreadTranscriptAppended.make({
      item: { _tag: "transcript.assistant", threadId, turnId, text: "hello" },
    })
    const ended = ThreadTurnEnded.make({ threadId, turnId, state: "completed" })
    const survivors = coalescePersistedForShell([
      { sequence: 1, event: started },
      { sequence: 2, event: assistant },
      { sequence: 3, event: ended },
    ])
    expect(survivors.map((item) => item.sequence)).toEqual([3])
    expect(survivors[0]?.event._tag).toBe("thread.turn.ended")
  })

  it("does not let a later assistant hide an earlier session-relevant event", () => {
    const started = ThreadTurnStarted.make({ threadId, turnId, text: "Travaille" })
    const assistant = ThreadTranscriptAppended.make({
      item: { _tag: "transcript.assistant", threadId, turnId, text: "hello" },
    })
    const survivors = coalescePersistedForShell([
      { sequence: 10, event: started },
      { sequence: 11, event: assistant },
      { sequence: 12, event: assistant },
    ])
    expect(survivors.map((item) => item.sequence)).toEqual([10])
  })
})
