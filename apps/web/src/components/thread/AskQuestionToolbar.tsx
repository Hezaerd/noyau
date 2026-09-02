import type { TranscriptUserInput } from "@noyau/contracts/entities/transcript"
import { useLayoutEffect, useRef, useState } from "react"

import { ComposerToolbarSurface } from "@/components/thread/ComposerToolbarSurface"
import {
  QuestionChoices,
  type DraftAnswers,
} from "@/components/thread/ThreadUserInputQuestionnaire"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { draftAnswersComplete, emptyUserInputAnswer } from "@/lib/user-input-answers"

/**
 * The one interactive surface for an AskQuestion request. Navigation is kept
 * local; the parent is notified only by the final submit action.
 */
export function AskQuestionToolbar({
  item,
  draft,
  legacyFreeform,
  currentQuestionIndex,
  onDraftChange,
  onLegacyFreeformChange,
  onCurrentQuestionIndexChange,
  onSubmit,
}: {
  readonly item: TranscriptUserInput
  readonly draft: DraftAnswers
  readonly legacyFreeform: string
  readonly currentQuestionIndex: number
  readonly onDraftChange: (requestId: string, draft: DraftAnswers) => void
  readonly onLegacyFreeformChange: (requestId: string, value: string) => void
  readonly onCurrentQuestionIndexChange: (requestId: string, index: number) => void
  readonly onSubmit: (requestId: string) => Promise<boolean>
}) {
  const questions = item.questions ?? []
  const [submitting, setSubmitting] = useState(false)
  const submitted = useRef(false)
  const questionIndex = Math.min(currentQuestionIndex, Math.max(0, questions.length - 1))
  const question = questions[questionIndex]
  const complete = draftAnswersComplete(item.questions, draft, legacyFreeform)
  const detached = item.status === "detached"

  useLayoutEffect(() => {
    setSubmitting(false)
    submitted.current = false
  }, [item.requestId, item.status])

  const submit = () => {
    if (submitted.current || submitting || !complete) {
      return
    }
    submitted.current = true
    setSubmitting(true)
    void onSubmit(item.requestId).then(
      (ok) => {
        if (!ok) {
          submitted.current = false
          setSubmitting(false)
        }
        return undefined
      },
      () => {
        submitted.current = false
        setSubmitting(false)
        return undefined
      },
    )
  }

  if (question === undefined) {
    const legacyComplete = legacyFreeform.trim().length > 0
    return (
      <ComposerToolbarSurface
        role="region"
        aria-label="Answer the agent"
        data-testid="ask-question-toolbar"
        className="flex flex-col gap-2 p-3"
      >
        {item.title === undefined ? null : (
          <p className="text-sm font-medium text-foreground">{item.title}</p>
        )}
        <p className="text-sm text-muted-foreground">
          {item.prompt ?? "The agent is waiting for an answer."}
        </p>
        {detached ? (
          <p role="status" className="text-sm text-muted-foreground">
            The previous provider session ended. Continue to start a new Turn with this answer.
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <Input
            value={legacyFreeform}
            onChange={(event) => onLegacyFreeformChange(item.requestId, event.target.value)}
            aria-label="Answer to the agent"
          />
          <Button type="button" disabled={!legacyComplete || submitting} onClick={submit}>
            {detached ? "Continue with answers" : "Send answer"}
          </Button>
        </div>
      </ComposerToolbarSurface>
    )
  }

  const answer = draft[question.id] ?? emptyUserInputAnswer()
  const currentComplete = answer.optionIds.length > 0 || (answer.freeform?.trim().length ?? 0) > 0
  const isLast = questionIndex === questions.length - 1

  return (
    <ComposerToolbarSurface
      role="region"
      aria-label="Answer the agent"
      data-testid="ask-question-toolbar"
      className="flex flex-col gap-3 p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          {item.title === undefined ? null : (
            <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Question {questionIndex + 1} of {questions.length}
          </p>
        </div>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {complete ? "All answered" : "Answer required"}
        </span>
      </div>

      <QuestionChoices
        question={question}
        answer={answer}
        disabled={false}
        onChange={(next) =>
          onDraftChange(item.requestId, {
            ...draft,
            [question.id]: next,
          })
        }
      />

      {detached ? (
        <p role="status" className="text-sm text-muted-foreground">
          The previous provider session ended. Continue to start a new Turn with these answers.
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={questionIndex === 0}
          onClick={() =>
            onCurrentQuestionIndexChange(item.requestId, Math.max(0, questionIndex - 1))
          }
        >
          Back
        </Button>
        {isLast ? (
          <Button type="button" size="sm" disabled={!complete || submitting} onClick={submit}>
            {detached ? "Continue with answers" : "Send answers"}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={!currentComplete}
            onClick={() =>
              onCurrentQuestionIndexChange(
                item.requestId,
                Math.min(questions.length - 1, questionIndex + 1),
              )
            }
          >
            Next
          </Button>
        )}
      </div>
    </ComposerToolbarSurface>
  )
}
