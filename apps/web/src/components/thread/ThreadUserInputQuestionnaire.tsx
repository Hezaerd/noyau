import type { UserInputAnswer, UserInputQuestion } from "@noyau/contracts/entities/approvals"
import type { TranscriptUserInput } from "@noyau/contracts/entities/transcript"
import type { ReactNode } from "react"

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

function QuestionChoices({
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

  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="text-sm font-medium">{question.prompt}</legend>
      <div className="flex flex-col gap-1.5" role={allowMultiple ? "group" : "radiogroup"}>
        {question.options.map((option) => {
          const selected = answer.optionIds.includes(option.id)
          return (
            <Button
              key={option.id}
              type="button"
              size="sm"
              variant={selected ? "default" : "outline"}
              className="h-auto justify-start whitespace-normal px-3 py-2 text-left"
              aria-pressed={selected}
              onClick={() => toggleOption(option.id)}
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
        placeholder="Autre réponse…"
        aria-label={`Autre réponse pour : ${question.prompt}`}
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
            {item.answers?.[LEGACY_ANSWER_KEY]?.freeform ?? item.prompt ?? "Réponse envoyée."}
          </p>
        )}
      </div>
    )
  }

  if (questions === undefined || questions.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {item.prompt ?? "L'agent attend une réponse."}
        </p>
        <div className="flex gap-2">
          <Input
            value={legacyFreeform}
            onChange={(event) => onLegacyFreeformChange(item.requestId, event.target.value)}
            aria-label="Réponse à l'agent"
          />
          <Button disabled={!complete} onClick={() => onSubmit(item.requestId)}>
            Répondre
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
          Envoyer les réponses
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
