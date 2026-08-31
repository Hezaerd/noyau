// @vitest-environment happy-dom

import { TranscriptItem } from "@noyau/contracts/entities/transcript"
import { ThreadId, TurnId } from "@noyau/contracts/ids"
import { cleanup, render, screen } from "@testing-library/react"
import { Schema } from "effect"
import { afterEach, describe, expect, it } from "vite-plus/test"

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
}) =>
  Schema.decodeSync(TranscriptItem)({
    _tag: "transcript.tool",
    threadId,
    turnId,
    toolCallId: input.toolCallId,
    name: "Read file",
    status: input.status,
    action: "read",
    ...(input.outputSummary === undefined ? {} : { outputSummary: input.outputSummary }),
  })

describe("ThreadTranscriptTool shimmer", () => {
  it("shimmers only the in-progress tool label", () => {
    const live = decodeTool({ toolCallId: "tool-1", status: "in_progress" })
    if (live._tag !== "transcript.tool") {
      throw new Error("expected transcript.tool")
    }

    render(<ThreadTranscriptTool item={live} />)

    expect(screen.getByText("Read file").classList.contains("shimmer")).toBe(true)
  })

  it("does not shimmer a settled tool", () => {
    const settled = decodeTool({
      toolCallId: "tool-1",
      status: "completed",
      outputSummary: "src/index.ts",
    })
    if (settled._tag !== "transcript.tool") {
      throw new Error("expected transcript.tool")
    }

    render(<ThreadTranscriptTool item={settled} />)

    expect(screen.getByText("src/index.ts").classList.contains("shimmer")).toBe(false)
  })

  it("shimmers the live group label on the text node", () => {
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
    if (live._tag !== "transcript.tool" || settled._tag !== "transcript.tool") {
      throw new Error("expected transcript.tool")
    }

    render(<ThreadTranscriptToolGroup items={[settled, live]} />)

    expect(screen.getByText("src/lib/thread-transcript.ts").classList.contains("shimmer")).toBe(
      true,
    )
  })
})
