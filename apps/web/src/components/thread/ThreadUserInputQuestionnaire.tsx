import type { UserInputAnswer, UserInputQuestion } from "@noyau/contracts/entities/approvals"
import type { TranscriptUserInput } from "@noyau/contracts/entities/transcript"
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  draftAnswersComplete,
  emptyUserInputAnswer,
  formatResolvedUserInputAnswer,
  LEGACY_ANSWER_KEY,
  withOptionalFreeform,
  type DraftAnswers,
} from "@/lib/user-input-answers"
import { cn } from "@/lib/utils"

export type { DraftAnswers }

export function QuestionChoices({
  question,
  answer,
  disabled,
  onChange,
}: {
  readonly question: UserInputQuestion
  readonly answer: UserInputAnswer
  readonly disabled: boolean
  readonly onChange: (next: UserInputAnswer) => void
}) {
  const allowMultiple = question.allowMultiple === true
  const freeform = answer.freeform ?? ""
  const selectedIndex = question.options.findIndex((option) => answer.optionIds.includes(option.id))
  const [activeOptionIndex, setActiveOptionIndex] = useState(selectedIndex >= 0 ? selectedIndex : 0)
  const radioRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    if (selectedIndex >= 0) {
      setActiveOptionIndex(selectedIndex)
    }
  }, [selectedIndex])

  const toggleOption = (optionId: string) => {
    if (allowMultiple) {
      const selected = answer.optionIds.includes(optionId)
        ? answer.optionIds.filter((id) => id !== optionId)
        : [...answer.optionIds, optionId]
      onChange(withOptionalFreeform(selected, freeform))
      return
    }
    onChange(withOptionalFreeform([optionId], freeform))
  }

  const moveRadio = (direction: -1 | 1) => {
    const nextIndex =
      (activeOptionIndex + direction + question.options.length) % question.options.length
    setActiveOptionIndex(nextIndex)
    toggleOption(question.options[nextIndex]!.id)
    radioRefs.current[nextIndex]?.focus()
  }

  const handleRadioKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (allowMultiple) {
      return
    }
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault()
      moveRadio(1)
      return
    }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault()
      moveRadio(-1)
    }
  }

  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="text-sm font-medium">{question.prompt}</legend>
      <div
        className="flex flex-col gap-1.5"
        role={allowMultiple ? "group" : "radiogroup"}
        aria-label={question.prompt}
      >
        {question.options.map((option, optionIndex) => {
          const selected = answer.optionIds.includes(option.id)
          return (
            <Button
              key={option.id}
              type="button"
              size="sm"
              variant={selected ? "default" : "outline"}
              className="h-auto justify-start whitespace-normal px-3 py-2 text-left"
              role={allowMultiple ? undefined : "radio"}
              aria-checked={allowMultiple ? undefined : selected}
              aria-pressed={allowMultiple ? selected : undefined}
              aria-setsize={allowMultiple ? undefined : question.options.length}
              aria-posinset={allowMultiple ? undefined : optionIndex + 1}
              tabIndex={allowMultiple ? undefined : optionIndex === activeOptionIndex ? 0 : -1}
              ref={
                allowMultiple
                  ? undefined
                  : (element) => {
                      radioRefs.current[optionIndex] = element
                    }
              }
              onClick={() => {
                if (!allowMultiple) {
                  setActiveOptionIndex(optionIndex)
                }
                toggleOption(option.id)
              }}
              onKeyDown={handleRadioKeyDown}
            >
              {option.label}
            </Button>
          )
        })}
      </div>
      <Input
        value={freeform}
        onChange={(event) => {
          onChange(withOptionalFreeform(answer.optionIds, event.target.value))
        }}
        placeholder="Other answer…"
        aria-label={`Other answer for: ${question.prompt}`}
      />
    </fieldset>
  )
}

export function ThreadUserInputQuestionnaire({
  item,
  draft,
  legacyFreeform,
  onDraftChange,
  onLegacyFreeformChange,
  onSubmit,
}: {
  readonly item: TranscriptUserInput
  readonly draft: DraftAnswers
  readonly legacyFreeform: string
  readonly onDraftChange: (requestId: string, draft: DraftAnswers) => void
  readonly onLegacyFreeformChange: (requestId: string, value: string) => void
  readonly onSubmit: (requestId: string) => void
}) {
  const questions = item.questions
  const pending = item.status === "pending"
  const complete = draftAnswersComplete(questions, draft, legacyFreeform)

  if (!pending) {
    return (
      <div className="flex flex-col gap-3">
        {item.title === undefined ? null : (
          <p className="text-sm font-medium text-foreground">{item.title}</p>
        )}
        {questions !== undefined && questions.length > 0 ? (
          questions.map((question) => (
            <div key={question.id} className="flex flex-col gap-1">
              <p className="text-sm text-foreground">{question.prompt}</p>
              <p className="text-sm text-muted-foreground">
                {formatResolvedUserInputAnswer(question, item.answers?.[question.id])}
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            {item.answers?.[LEGACY_ANSWER_KEY]?.freeform ?? item.prompt ?? "Answer sent."}
          </p>
        )}
      </div>
    )
  }

  if (questions === undefined || questions.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {item.prompt ?? "The agent is waiting for an answer."}
        </p>
        <div className="flex gap-2">
          <Input
            value={legacyFreeform}
            onChange={(event) => onLegacyFreeformChange(item.requestId, event.target.value)}
            aria-label="Answer to the agent"
          />
          <Button disabled={!complete} onClick={() => onSubmit(item.requestId)}>
            Reply
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {item.title === undefined ? null : (
        <p className="text-sm font-medium text-foreground">{item.title}</p>
      )}
      {questions.map((question) => (
        <QuestionChoices
          key={question.id}
          question={question}
          answer={draft[question.id] ?? emptyUserInputAnswer()}
          disabled={false}
          onChange={(next) =>
            onDraftChange(item.requestId, {
              ...draft,
              [question.id]: next,
            })
          }
        />
      ))}
      <div className="flex justify-end">
        <Button disabled={!complete} onClick={() => onSubmit(item.requestId)}>
          Send answers
        </Button>
      </div>
    </div>
  )
}

/** Sticky shell for a pending questionnaire inside the transcript scroller. */
export function StickyUserInputShell({
  pending,
  children,
}: {
  readonly pending: boolean
  readonly children: ReactNode
}) {
  return (
    <div
      className={cn(
        pending
          ? "sticky bottom-0 z-10 -mx-1 rounded-xl border border-border bg-background/95 p-3 shadow-sm backdrop-blur supports-backdrop-filter:bg-background/80"
          : undefined,
      )}
    >
      {children}
    </div>
  )
}
