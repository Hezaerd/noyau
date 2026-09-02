// @vitest-environment happy-dom

import { TranscriptItem } from "@noyau/contracts/entities/transcript"
import { Turn } from "@noyau/contracts/entities/turn"
import { ProjectId, ThreadId, TurnId } from "@noyau/contracts/ids"
import { cleanup, render, screen } from "@testing-library/react"
import { Schema } from "effect"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { readonly children: string }) => <a href="/source-thread">{children}</a>,
}))

import { ThreadTranscript } from "../src/components/thread/ThreadTranscript"
import { clearAssistantPaint, pushAssistantLive } from "../src/lib/assistant-paint"

afterEach(() => {
  cleanup()
  clearAssistantPaint()
})

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const sourceThreadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const destinationThreadId = ThreadId.make("20000000-0000-4000-8000-000000000002")
const sourceTurnId = TurnId.make("40000000-0000-4000-8000-000000000001")
const destinationTurnId = TurnId.make("40000000-0000-4000-8000-000000000002")

const item = (threadId: ThreadId, turnId: TurnId, text: string) =>
  Schema.decodeSync(TranscriptItem)({ _tag: "transcript.user", threadId, turnId, text })

const assistantItem = (text: string) =>
  Schema.decodeSync(TranscriptItem)({
    _tag: "transcript.assistant",
    threadId: destinationThreadId,
    turnId: destinationTurnId,
    text,
  })

const completedTurn = Schema.decodeSync(Turn)({
  id: destinationTurnId,
  threadId: destinationThreadId,
  ordinal: 1,
  state: "completed",
  requestedAt: "2026-08-25T16:54:00.000Z",
  startedAt: "2026-08-25T16:54:00.000Z",
  completedAt: "2026-08-25T16:55:00.000Z",
  providerForkPoint: { schemaVersion: 1, boundaryId: "provider-final-assistant-message" },
})

describe("forked Thread transcript", () => {
  it("renders inherited conversation before the destination transcript", () => {
    render(
      <ThreadTranscript
        transcript={[item(destinationThreadId, destinationTurnId, "New branch message")]}
        inheritedTranscript={[item(sourceThreadId, sourceTurnId, "Original conversation")]}
        forkOrigin={{ sourceThreadId, sourceTurnId }}
        forkSourceTitle="Thread smoke test"
        isRunning={false}
        loading={false}
        error={undefined}
        notices={null}
        projectId={projectId}
        draftByRequest={{}}
        legacyFreeformByRequest={{}}
        onDraftAnswersChange={() => undefined}
        onLegacyFreeformChange={() => undefined}
        onRespondApproval={() => undefined}
        onRespondUserInput={() => undefined}
      />,
    )

    const original = screen.getByText("Original conversation")
    const destination = screen.getByText("New branch message")
    expect(
      original.compareDocumentPosition(destination) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0)
    expect(screen.getByRole("link", { name: "Forked from Thread smoke test" })).toBeTruthy()
    expect(screen.getByText("Thread smoke test").tagName).toBe("EM")
  })

  it("only exposes a fork action on the final assistant item for a Turn", () => {
    render(
      <ThreadTranscript
        transcript={[
          assistantItem("First response bubble"),
          assistantItem("Final response bubble"),
        ]}
        isRunning={false}
        turns={[completedTurn]}
        loading={false}
        error={undefined}
        notices={null}
        projectId={projectId}
        draftByRequest={{}}
        legacyFreeformByRequest={{}}
        onDraftAnswersChange={() => undefined}
        onLegacyFreeformChange={() => undefined}
        onRespondApproval={() => undefined}
        onRespondUserInput={() => undefined}
        onForkTurn={() => undefined}
      />,
    )

    expect(screen.getAllByRole("button", { name: "Fork from this response" })).toHaveLength(1)
  })

  it("keeps the latest settled response forkable after its final live paint", () => {
    pushAssistantLive({
      threadId: destinationThreadId,
      turnId: destinationTurnId,
      text: "Final response",
    })
    render(
      <ThreadTranscript
        transcript={[assistantItem("Final response")]}
        isRunning={false}
        latestTurn={{
          turnId: destinationTurnId,
          state: "completed",
          requestedAt: completedTurn.requestedAt,
          startedAt: completedTurn.startedAt,
          completedAt: completedTurn.completedAt,
        }}
        turns={[completedTurn]}
        loading={false}
        error={undefined}
        notices={null}
        projectId={projectId}
        draftByRequest={{}}
        legacyFreeformByRequest={{}}
        onDraftAnswersChange={() => undefined}
        onLegacyFreeformChange={() => undefined}
        onRespondApproval={() => undefined}
        onRespondUserInput={() => undefined}
        onForkTurn={() => undefined}
      />,
    )

    expect(screen.getByRole("button", { name: "Fork from this response" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Copy message" })).toBeTruthy()
  })
})
