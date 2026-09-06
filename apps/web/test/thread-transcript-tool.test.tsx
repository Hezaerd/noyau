// @vitest-environment happy-dom

import { TranscriptTool } from "@noyau/contracts/entities/transcript"
import { ThreadId, TurnId } from "@noyau/contracts/ids"
import { cleanup, render, screen } from "@testing-library/react"
import { Schema } from "effect"
import { afterEach, describe, expect, it } from "vitest"

import {
  ThreadTranscriptTool,
  ThreadTranscriptToolGroup,
} from "../src/components/thread/ThreadTranscriptTool"

afterEach(() => {
  cleanup()
})

const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const turnId = TurnId.make("40000000-0000-4000-8000-000000000001")

const decodeTool = (input: {
  readonly toolCallId: string
  readonly status: "in_progress" | "completed" | "error"
  readonly outputSummary?: string
}) => {
  const tool = {
    _tag: "transcript.tool" as const,
    threadId,
    turnId,
    toolCallId: input.toolCallId,
    name: "Read file",
    status: input.status,
    action: "read" as const,
  }
  if (input.outputSummary === undefined) {
    return Schema.decodeSync(TranscriptTool)(tool)
  }
  return Schema.decodeSync(TranscriptTool)({
    ...tool,
    outputSummary: input.outputSummary,
  })
}

describe("ThreadTranscriptTool working state", () => {
  it("marks only the in-progress tool label as working", () => {
    const live = decodeTool({ toolCallId: "tool-1", status: "in_progress" })

    render(<ThreadTranscriptTool item={live} />)

    expect(screen.getByText("Read file").classList.contains("state-working")).toBe(true)
  })

  it("does not shimmer a settled tool", () => {
    const settled = decodeTool({
      toolCallId: "tool-1",
      status: "completed",
      outputSummary: "src/index.ts",
    })

    render(<ThreadTranscriptTool item={settled} />)

    expect(screen.getByText("src/index.ts").classList.contains("state-working")).toBe(false)
  })

  it("marks the live group label as working on the text node", () => {
    const live = decodeTool({
      toolCallId: "tool-2",
      status: "in_progress",
      outputSummary: "src/lib/thread-transcript.ts",
    })
    const settled = decodeTool({
      toolCallId: "tool-1",
      status: "completed",
      outputSummary: "src/index.ts",
    })

    render(<ThreadTranscriptToolGroup items={[settled, live]} />)

    expect(
      screen.getByText("src/lib/thread-transcript.ts").classList.contains("state-working"),
    ).toBe(true)
  })
})
