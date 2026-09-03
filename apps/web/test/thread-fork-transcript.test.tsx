// @vitest-environment happy-dom

import { TranscriptItem } from "@noyau/contracts/entities/transcript"
import { Turn } from "@noyau/contracts/entities/turn"
import { ProjectId, ThreadId, TurnId } from "@noyau/contracts/ids"
import { cleanup, render, screen } from "@testing-library/react"
import { Schema } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { readonly children: string }) => <a href="/source-thread">{children}</a>,
}))

import { ThreadTranscript } from "../src/components/thread/ThreadTranscript"
import { clearAssistantPaint, pushAssistantLive } from "../src/lib/assistant-paint"
import { decodeThreadMarkdownFileHref } from "../src/lib/markdown-file-links"

afterEach(() => {
  cleanup()
  clearAssistantPaint()
})

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const sourceThreadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const destinationThreadId = ThreadId.make("20000000-0000-4000-8000-000000000002")
const sourceTurnId = TurnId.make("40000000-0000-4000-8000-000000000001")
const destinationTurnId = TurnId.make("40000000-0000-4000-8000-000000000002")
const secondDestinationTurnId = TurnId.make("40000000-0000-4000-8000-000000000003")

const item = (threadId: ThreadId, turnId: TurnId, text: string) =>
  Schema.decodeSync(TranscriptItem)({ _tag: "transcript.user", threadId, turnId, text })

const assistantItem = (turnId: TurnId, text: string) =>
  Schema.decodeSync(TranscriptItem)({
    _tag: "transcript.assistant",
    threadId: destinationThreadId,
    turnId,
    text,
  })

const completedTurn = (turnId: TurnId) =>
  Schema.decodeSync(Turn)({
    id: turnId,
    threadId: destinationThreadId,
    ordinal: 1,
    state: "completed",
    requestedAt: "2026-08-25T16:54:00.000Z",
    startedAt: "2026-08-25T16:54:00.000Z",
    completedAt: "2026-08-25T16:55:00.000Z",
    providerForkPoint: { schemaVersion: 1, boundaryId: "provider-final-assistant-message" },
  })

const destinationCompletedTurn = completedTurn(destinationTurnId)

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

  it("resolves inherited file links against the retained thread checkout", () => {
    render(
      <ThreadTranscript
        transcript={[]}
        inheritedTranscript={[item(sourceThreadId, sourceTurnId, "[source](src/file.ts)")]}
        isRunning={false}
        loading={false}
        error={undefined}
        notices={null}
        workspaceRoot="/Users/test/project"
        cwd="/Users/test/worktree"
        projectId={projectId}
        draftByRequest={{}}
        legacyFreeformByRequest={{}}
        onDraftAnswersChange={() => undefined}
        onLegacyFreeformChange={() => undefined}
        onRespondApproval={() => undefined}
        onRespondUserInput={() => undefined}
      />,
    )

    const link = document.querySelector("[data-thread-markdown-file-chip]")
    expect(link).not.toBeNull()
    expect(decodeThreadMarkdownFileHref(link?.getAttribute("href") ?? "")).toBe(
      "/Users/test/worktree/src/file.ts",
    )
  })

  it("only exposes a fork action on the final assistant item for a Turn", () => {
    render(
      <ThreadTranscript
        transcript={[
          assistantItem(destinationTurnId, "First response bubble"),
          assistantItem(destinationTurnId, "Final response bubble"),
        ]}
        isRunning={false}
        turns={[destinationCompletedTurn]}
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
        transcript={[assistantItem(destinationTurnId, "Final response")]}
        isRunning={false}
        latestTurn={{
          turnId: destinationTurnId,
          state: "completed",
          requestedAt: destinationCompletedTurn.requestedAt,
          startedAt: destinationCompletedTurn.startedAt,
          completedAt: destinationCompletedTurn.completedAt,
        }}
        turns={[destinationCompletedTurn]}
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

  it("disables every fork action while a fork request is pending", () => {
    render(
      <ThreadTranscript
        transcript={[
          assistantItem(destinationTurnId, "First response"),
          assistantItem(secondDestinationTurnId, "Second response"),
        ]}
        isRunning={false}
        turns={[destinationCompletedTurn, completedTurn(secondDestinationTurnId)]}
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
        forkPendingTurnId={destinationTurnId}
      />,
    )

    expect(screen.getByRole("button", { name: "Forking response" })).toHaveProperty(
      "disabled",
      true,
    )
    expect(screen.getByRole("button", { name: "Fork from this response" })).toHaveProperty(
      "disabled",
      true,
    )
  })
})
