// @vitest-environment happy-dom

import { TranscriptUserInput } from "@noyau/contracts/entities/transcript"
import { ThreadId, TurnId } from "@noyau/contracts/ids"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Schema } from "effect"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { AskQuestionToolbar } from "../src/components/thread/AskQuestionToolbar"
import { ThreadTranscriptItem } from "../src/components/thread/ThreadTranscriptItem"
import type { DraftAnswers } from "../src/components/thread/ThreadUserInputQuestionnaire"
import { TooltipProvider } from "../src/components/ui/tooltip"

afterEach(() => {
  cleanup()
})

const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const turnId = TurnId.make("40000000-0000-4000-8000-000000000001")
const requestId = "60000000-0000-4000-8000-000000000001"

const request = Schema.decodeSync(TranscriptUserInput)({
  _tag: "transcript.user-input",
  threadId,
  turnId,
  requestId,
  title: "Help me choose",
  questions: [
    {
      id: "one",
      prompt: "First choice",
      options: [
        { id: "one-a", label: "First A" },
        { id: "one-b", label: "First B" },
      ],
    },
    {
      id: "two",
      prompt: "Second choice",
      options: [
        { id: "two-a", label: "Second A" },
        { id: "two-b", label: "Second B" },
      ],
    },
    {
      id: "three",
      prompt: "Third choice",
      options: [
        { id: "three-a", label: "Third A" },
        { id: "three-b", label: "Third B" },
      ],
    },
  ],
  status: "pending",
})

const renderToolbar = (
  onSubmit = vi.fn().mockResolvedValue(true),
  item: typeof request = request,
) => {
  function ControlledToolbar({ currentItem }: { readonly currentItem: typeof request }) {
    const [draft, setDraft] = useState<DraftAnswers>({})
    const [legacyFreeform, setLegacyFreeform] = useState("")
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
    return (
      <AskQuestionToolbar
        item={currentItem}
        draft={draft}
        legacyFreeform={legacyFreeform}
        currentQuestionIndex={currentQuestionIndex}
        onDraftChange={(_, next) => setDraft(next)}
        onLegacyFreeformChange={(_, next) => setLegacyFreeform(next)}
        onCurrentQuestionIndexChange={(_, next) => setCurrentQuestionIndex(next)}
        onSubmit={onSubmit}
      />
    )
  }
  const rendered = render(<ControlledToolbar currentItem={item} />)
  return {
    onSubmit,
    ...rendered,
    rerenderItem: (currentItem: typeof request) =>
      rendered.rerender(<ControlledToolbar currentItem={currentItem} />),
  }
}

describe("AskQuestionToolbar", () => {
  it("navigates three questions locally and submits one complete answer", async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderToolbar()

    expect(screen.getByTestId("ask-question-toolbar").getAttribute("data-slot")).toBe(
      "composer-toolbar-surface",
    )
    expect(screen.getByText("Question 1 of 3")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "First A" }))
    await user.click(screen.getByRole("button", { name: "Next" }))
    expect(screen.getByText("Question 2 of 3")).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Second B" }))
    await user.click(screen.getByRole("button", { name: "Back" }))
    expect(screen.getByText("Question 1 of 3")).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Next" }))
    await user.click(screen.getByRole("button", { name: "Next" }))
    expect(screen.getByText("Question 3 of 3")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Send answers" }).getAttribute("disabled")).not.toBe(
      null,
    )
    await user.click(screen.getByRole("button", { name: "Third A" }))
    await user.click(screen.getByRole("button", { name: "Send answers" }))
    await user.click(screen.getByRole("button", { name: "Send answers" }))
    expect(onSubmit).toHaveBeenCalledOnce()
    expect(onSubmit).toHaveBeenCalledWith(requestId)
  })

  it("keeps a pending transcript request passive", () => {
    render(
      <TooltipProvider>
        <ThreadTranscriptItem
          item={request}
          streaming={false}
          draftAnswers={{}}
          legacyFreeform=""
          onDraftAnswersChange={() => undefined}
          onLegacyFreeformChange={() => undefined}
          onRespondApproval={() => undefined}
          onRespondUserInput={() => undefined}
        />
      </TooltipProvider>,
    )

    expect(screen.getByText("Waiting for your response · 3 questions.")).toBeTruthy()
    expect(screen.queryByTestId("ask-question-toolbar")).toBeNull()
    expect(screen.queryByRole("button", { name: "First A" })).toBeNull()
  })

  it("explains and submits a detached request as a continuation exactly once", async () => {
    const user = userEvent.setup()
    const detached = { ...request, status: "detached" as const }
    const onSubmit = vi.fn().mockResolvedValue(true)
    renderToolbar(onSubmit, detached)

    expect(screen.getByRole("status").textContent).toContain("previous provider session ended")
    await user.click(screen.getByRole("button", { name: "First A" }))
    await user.click(screen.getByRole("button", { name: "Next" }))
    await user.click(screen.getByRole("button", { name: "Second A" }))
    await user.click(screen.getByRole("button", { name: "Next" }))
    await user.click(screen.getByRole("button", { name: "Third A" }))
    await user.click(screen.getByRole("button", { name: "Continue with answers" }))
    await user.click(screen.getByRole("button", { name: "Continue with answers" }))

    expect(onSubmit).toHaveBeenCalledOnce()
    expect(onSubmit).toHaveBeenCalledWith(requestId)
  })

  it("keeps detached transcript history passive while recovery lives in the composer", () => {
    render(
      <TooltipProvider>
        <ThreadTranscriptItem
          item={{ ...request, status: "detached" }}
          streaming={false}
          draftAnswers={{}}
          legacyFreeform=""
          onDraftAnswersChange={() => undefined}
          onLegacyFreeformChange={() => undefined}
          onRespondApproval={() => undefined}
          onRespondUserInput={() => undefined}
        />
      </TooltipProvider>,
    )

    expect(screen.getByText(/answer draft can be continued from the composer/i)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Continue with answers" })).toBeNull()
  })

  it("keeps the draft retryable when the response dispatch fails", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(false)
    renderToolbar(onSubmit, { ...request, status: "detached" })

    await user.click(screen.getByRole("button", { name: "First A" }))
    await user.click(screen.getByRole("button", { name: "Next" }))
    await user.click(screen.getByRole("button", { name: "Second A" }))
    await user.click(screen.getByRole("button", { name: "Next" }))
    await user.click(screen.getByRole("button", { name: "Third A" }))
    await user.click(screen.getByRole("button", { name: "Continue with answers" }))

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Continue with answers" }).getAttribute("disabled"),
      ).toBe(null)
    })
    await user.click(screen.getByRole("button", { name: "Continue with answers" }))
    expect(onSubmit).toHaveBeenCalledTimes(2)
  })

  it("unlocks an accepted live submission when the request detaches before resolution", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(true)
    const { rerenderItem } = renderToolbar(onSubmit)

    await user.click(screen.getByRole("button", { name: "First A" }))
    await user.click(screen.getByRole("button", { name: "Next" }))
    await user.click(screen.getByRole("button", { name: "Second A" }))
    await user.click(screen.getByRole("button", { name: "Next" }))
    await user.click(screen.getByRole("button", { name: "Third A" }))
    await user.click(screen.getByRole("button", { name: "Send answers" }))
    expect(screen.getByRole("button", { name: "Send answers" }).getAttribute("disabled")).not.toBe(
      null,
    )

    rerenderItem({ ...request, status: "detached" })

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Continue with answers" }).getAttribute("disabled"),
      ).toBe(null)
    })
    await user.click(screen.getByRole("button", { name: "Continue with answers" }))
    expect(onSubmit).toHaveBeenCalledTimes(2)
  })
})
