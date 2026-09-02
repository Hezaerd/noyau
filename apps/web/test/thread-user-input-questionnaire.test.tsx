// @vitest-environment happy-dom

import { TranscriptUserInput } from "@noyau/contracts/entities/transcript"
import { ThreadId, TurnId } from "@noyau/contracts/ids"
import { fireEvent, render, screen, cleanup } from "@testing-library/react"
import { Schema } from "effect"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import {
  ThreadUserInputQuestionnaire,
  type DraftAnswers,
} from "../src/components/thread/ThreadUserInputQuestionnaire"

const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const turnId = TurnId.make("40000000-0000-4000-8000-000000000001")

const item = Schema.decodeSync(TranscriptUserInput)({
  _tag: "transcript.user-input",
  threadId,
  turnId,
  requestId: "60000000-0000-4000-8000-000000000001",
  title: "Choose a direction",
  status: "pending",
  questions: [
    {
      id: "direction",
      prompt: "Which direction?",
      options: [
        { id: "left", label: "Left" },
        { id: "right", label: "Right" },
      ],
    },
  ],
})

const renderQuestionnaire = (allowMultiple: boolean) => {
  const questionItem = Schema.decodeSync(TranscriptUserInput)({
    ...item,
    questions: item.questions?.map((question) => ({ ...question, allowMultiple })),
  })
  const onDraftChange = vi.fn()
  render(
    <ThreadUserInputQuestionnaire
      item={questionItem}
      draft={{}}
      legacyFreeform=""
      onDraftChange={onDraftChange}
      onLegacyFreeformChange={vi.fn()}
      onSubmit={vi.fn()}
    />,
  )
  return { onDraftChange }
}

function ControlledQuestionnaire({ allowMultiple }: { readonly allowMultiple: boolean }) {
  const [draft, setDraft] = useState<DraftAnswers>({})
  const questionItem = Schema.decodeSync(TranscriptUserInput)({
    ...item,
    questions: item.questions?.map((question) => ({ ...question, allowMultiple })),
  })
  return (
    <ThreadUserInputQuestionnaire
      item={questionItem}
      draft={draft}
      legacyFreeform=""
      onDraftChange={(_, next) => setDraft(next)}
      onLegacyFreeformChange={vi.fn()}
      onSubmit={vi.fn()}
    />
  )
}

afterEach(() => {
  cleanup()
})

describe("ThreadUserInputQuestionnaire option semantics", () => {
  it("uses radio semantics for a single-choice question", () => {
    const { onDraftChange } = renderQuestionnaire(false)

    expect(screen.getByRole("radiogroup", { name: "Which direction?" })).toBeTruthy()
    const radios = screen.getAllByRole("radio")
    expect(radios).toHaveLength(2)
    expect(radios[0]?.getAttribute("aria-checked")).toBe("false")
    expect(radios[0]?.hasAttribute("aria-pressed")).toBe(false)

    fireEvent.click(radios[0])
    expect(onDraftChange.mock.calls[0]).toEqual([
      item.requestId,
      {
        direction: { optionIds: ["left"] },
      },
    ])
  })

  it("retains pressed-button semantics for multi-select questions", () => {
    const { onDraftChange } = renderQuestionnaire(true)

    expect(screen.queryByRole("radiogroup")).toBeNull()
    const options = screen.getAllByRole("button", { name: /^(Left|Right)$/ })
    expect(options).toHaveLength(2)
    expect(options[0]?.getAttribute("aria-pressed")).toBe("false")
    expect(options[0]?.hasAttribute("aria-checked")).toBe(false)

    fireEvent.click(options[0])
    expect(onDraftChange.mock.calls[0]).toEqual([
      item.requestId,
      {
        direction: { optionIds: ["left"] },
      },
    ])
  })

  it("roves focus and selection with arrow keys in a single-choice group", () => {
    render(<ControlledQuestionnaire allowMultiple={false} />)

    const radios = screen.getAllByRole("radio")
    expect(radios[0]?.tabIndex).toBe(0)
    expect(radios[1]?.tabIndex).toBe(-1)

    radios[0]?.focus()
    fireEvent.keyDown(radios[0], { key: "ArrowDown" })

    expect(document.activeElement).toBe(radios[1])
    expect(radios[0]?.tabIndex).toBe(-1)
    expect(radios[1]?.tabIndex).toBe(0)
    expect(radios[1]?.getAttribute("aria-checked")).toBe("true")

    fireEvent.keyDown(radios[1], { key: "ArrowRight" })
    expect(document.activeElement).toBe(radios[0])
    expect(radios[0]?.getAttribute("aria-checked")).toBe("true")
  })
})
