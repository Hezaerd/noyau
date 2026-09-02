import type { ProviderUserInputAnswers } from "@noyau/contracts/entities/approvals"
import type { TranscriptUserInput } from "@noyau/contracts/entities/transcript"

const quoted = (value: string): string => JSON.stringify(value)

const renderedAnswer = (
  question: NonNullable<TranscriptUserInput["questions"]>[number],
  answers: ProviderUserInputAnswers,
): string => {
  const answer = answers[question.id]
  if (answer === undefined) {
    return "(no answer)"
  }
  const optionLabels = new Map(question.options.map((option) => [option.id, option.label]))
  const values = answer.optionIds.map((optionId) => optionLabels.get(optionId) ?? optionId)
  if (answer.freeform !== undefined) {
    values.push(answer.freeform)
  }
  return values.length === 0 ? "(no answer)" : values.map(quoted).join(", ")
}

/** Stable provider-neutral prompt used when a detached callback is continued in a new Turn. */
export const userInputContinuationText = (
  request: TranscriptUserInput,
  answers: ProviderUserInputAnswers,
): string => {
  const heading = "Answers to questions from an earlier interrupted turn:"
  const questions = request.questions ?? []
  if (questions.length > 0) {
    return [
      heading,
      ...questions.flatMap((question, index) => [
        `${index + 1}. Question: ${quoted(question.prompt)}`,
        `Answer: ${renderedAnswer(question, answers)}`,
      ]),
    ].join("\n")
  }
  const prompt = request.prompt ?? request.title ?? "Previous question"
  const answer = answers.answer
  const values = answer === undefined ? [] : [...answer.optionIds]
  if (answer?.freeform !== undefined) {
    values.push(answer.freeform)
  }
  return [
    heading,
    `1. Question: ${quoted(prompt)}`,
    `Answer: ${values.length === 0 ? "(no answer)" : values.map(quoted).join(", ")}`,
  ].join("\n")
}
