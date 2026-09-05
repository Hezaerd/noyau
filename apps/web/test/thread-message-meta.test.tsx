// @vitest-environment happy-dom

import { TranscriptItem } from "@noyau/contracts/entities/transcript"
import { Turn } from "@noyau/contracts/entities/turn"
import { ThreadId, TurnId } from "@noyau/contracts/ids"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Schema } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ThreadTranscriptItem } from "../src/components/thread/ThreadTranscriptItem"
import { TooltipProvider } from "../src/components/ui/tooltip"
import { writeClipboardText } from "../src/lib/clipboard"

vi.mock("../src/lib/clipboard", () => ({
  writeClipboardText: vi.fn(() => Promise.resolve()),
}))

Object.defineProperty(HTMLElement.prototype, "getAnimations", {
  configurable: true,
  value: () => [],
})

afterEach(() => {
  cleanup()
})

const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const turnId = TurnId.make("40000000-0000-4000-8000-000000000001")
const userItem = Schema.decodeSync(TranscriptItem)({
  _tag: "transcript.user",
  threadId,
  turnId,
  text: "Parfait c'est lock-in",
})
const assistantItem = Schema.decodeSync(TranscriptItem)({
  _tag: "transcript.assistant",
  threadId,
  turnId,
  text: "C'est noté.",
})
const handedOffItem = Schema.decodeSync(TranscriptItem)({
  _tag: "transcript.user",
  threadId,
  turnId,
  text: "Review the implementation",
  providerHandoff: { previousProvider: "cursor", provider: "claude" },
})
const modelHandedOffItem = Schema.decodeSync(TranscriptItem)({
  _tag: "transcript.user",
  threadId,
  turnId,
  text: "Continue the implementation",
  providerHandoff: {
    previousProvider: "cursor",
    provider: "codex",
    previousModelSelection: { modelId: "composer-2.5" },
    modelSelection: { modelId: "gpt-5.6-luna" },
  },
})
const turn = Schema.decodeSync(Turn)({
  id: turnId,
  threadId,
  ordinal: 1,
  state: "completed",
  requestedAt: "2026-08-25T16:54:00.000Z",
  startedAt: "2026-08-25T16:54:00.000Z",
  completedAt: "2026-08-25T16:55:00.000Z",
  providerForkPoint: { schemaVersion: 1, boundaryId: "assistant-message-1" },
})

const renderItem = (item: typeof userItem, streaming = false, onFork?: (turnId: string) => void) =>
  render(
    <TooltipProvider>
      <ThreadTranscriptItem
        item={item}
        streaming={streaming}
        turn={turn}
        draftAnswers={{}}
        legacyFreeform=""
        onDraftAnswersChange={() => undefined}
        onLegacyFreeformChange={() => undefined}
        onRespondApproval={() => undefined}
        onRespondUserInput={() => undefined}
        {...(onFork === undefined ? {} : { onFork })}
      />
    </TooltipProvider>,
  )

describe("thread message meta", () => {
  it("shows the hover timestamp and copies the user text", async () => {
    const user = userEvent.setup()
    renderItem(userItem)

    expect(screen.getByText("Parfait c'est lock-in")).toBeTruthy()
    const copy = screen.getByRole("button", { name: "Copy message" })
    expect(copy).toBeTruthy()
    expect(copy.closest("[data-slot='message-footer']")?.className).toContain(
      "group-hover/message:opacity-100",
    )

    await user.click(copy)
    expect(writeClipboardText).toHaveBeenCalledWith("Parfait c'est lock-in")
  })

  it("keeps copy on a settled assistant and hides it while streaming", () => {
    const settled = renderItem(assistantItem)
    expect(screen.getByRole("button", { name: "Copy message" })).toBeTruthy()
    settled.unmount()

    renderItem(assistantItem, true)
    expect(screen.queryByRole("button", { name: "Copy message" })).toBeNull()
  })

  it("forks a settled assistant response without exposing the action while streaming", async () => {
    const user = userEvent.setup()
    const onFork = vi.fn()
    const settled = renderItem(assistantItem, false, onFork)
    await user.click(screen.getByRole("button", { name: "Fork from this response" }))
    expect(onFork).toHaveBeenCalledWith(turnId)
    settled.unmount()

    renderItem(assistantItem, true, onFork)
    expect(screen.queryByRole("button", { name: "Fork from this response" })).toBeNull()
  })

  it("does not expose a fork action when the provider did not supply a fork boundary", () => {
    render(
      <TooltipProvider>
        <ThreadTranscriptItem
          item={assistantItem}
          streaming={false}
          turn={{ ...turn, providerForkPoint: undefined }}
          draftAnswers={{}}
          legacyFreeform=""
          onDraftAnswersChange={() => undefined}
          onLegacyFreeformChange={() => undefined}
          onRespondApproval={() => undefined}
          onRespondUserInput={() => undefined}
          onFork={vi.fn()}
        />
      </TooltipProvider>,
    )

    expect(screen.queryByRole("button", { name: "Fork from this response" })).toBeNull()
  })

  it("lets assistant content use the full transcript width", () => {
    renderItem(assistantItem)

    const bubbleContent = screen.getByText("C'est noté.").closest("[data-slot='bubble-content']")
    expect(bubbleContent?.className).toContain("w-full")
    expect(bubbleContent?.closest("[data-slot='bubble']")?.className).toContain("w-full")
  })

  it("keeps provider labels for a legacy handoff Turn", () => {
    renderItem(handedOffItem)

    expect(screen.getByText("Cursor")).toBeTruthy()
    expect(screen.getByText("Claude Code")).toBeTruthy()
    expect(screen.getByText("Review the implementation")).toBeTruthy()
  })

  it("shows model labels on a model-aware handoff Turn", () => {
    renderItem(modelHandedOffItem)

    expect(screen.getByText("composer-2.5")).toBeTruthy()
    expect(screen.getByText("gpt-5.6-luna")).toBeTruthy()
    expect(
      screen.getByLabelText("Provider handoff: Cursor, composer-2.5 to Codex, gpt-5.6-luna"),
    ).toBeTruthy()
  })
})
