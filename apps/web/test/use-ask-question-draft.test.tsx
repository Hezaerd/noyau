// @vitest-environment happy-dom

import { TranscriptUserInput } from "@noyau/contracts/entities/transcript"
import { ApprovalRequestId, ProjectId, ThreadId, TurnId } from "@noyau/contracts/ids"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Schema } from "effect"
import { afterEach, describe, expect, it } from "vite-plus/test"

import { useAskQuestionDraft } from "../src/hooks/use-ask-question-draft"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const turnId = TurnId.make("40000000-0000-4000-8000-000000000001")
const request = Schema.decodeSync(TranscriptUserInput)({
  _tag: "transcript.user-input",
  threadId,
  turnId,
  requestId: ApprovalRequestId.make("request-hook"),
  questions: [
    {
      id: "one",
      prompt: "One?",
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
    },
    {
      id: "two",
      prompt: "Two?",
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
    },
  ],
  status: "pending",
})

function Harness() {
  const draft = useAskQuestionDraft({ projectId, threadId, request, transcript: [request] })
  return (
    <>
      <span data-testid="index">{draft.value.currentQuestionIndex}</span>
      <span data-testid="answer">{draft.value.answers.one?.optionIds.join(",")}</span>
      <button type="button" onClick={() => draft.setAnswers({ one: { optionIds: ["a"] } })}>
        answer
      </button>
      <button type="button" onClick={() => draft.setCurrentQuestionIndex(1)}>
        next
      </button>
    </>
  )
}

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe("useAskQuestionDraft", () => {
  it("restores answers and navigation after remount", async () => {
    const first = render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "answer" }))
    fireEvent.click(screen.getByRole("button", { name: "next" }))
    expect(screen.getByTestId("index").textContent).toBe("1")
    first.unmount()

    render(<Harness />)
    await waitFor(() => {
      expect(screen.getByTestId("index").textContent).toBe("1")
      expect(screen.getByTestId("answer").textContent).toBe("a")
    })
  })
})
