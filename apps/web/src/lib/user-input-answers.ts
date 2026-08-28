import type {
  ProviderUserInputAnswers,
  UserInputAnswer,
  UserInputQuestion,
} from "@noyau/contracts/entities/approvals"

const LEGACY_ANSWER_KEY = "answer"

export type DraftAnswers = Record<string, UserInputAnswer>

export const emptyUserInputAnswer = (): UserInputAnswer => ({ optionIds: [] })

export const withOptionalFreeform = (
  optionIds: ReadonlyArray<string>,
  freeform: string | undefined,
): UserInputAnswer => {
  const trimmed = freeform?.trim()
  if (trimmed === undefined || trimmed.length === 0) {
    return { optionIds: [...optionIds] }
  }
  return { optionIds: [...optionIds], freeform: trimmed }
}

export const draftAnswersComplete = (
  questions: ReadonlyArray<UserInputQuestion> | undefined,
  draft: DraftAnswers,
  legacyFreeform: string,
): boolean => {
  if (questions === undefined || questions.length === 0) {
    return legacyFreeform.trim().length > 0
  }
  return questions.every((question) => {
    const answer = draft[question.id] ?? emptyUserInputAnswer()
    const freeform = answer.freeform?.trim() ?? ""
    return answer.optionIds.length > 0 || freeform.length > 0
  })
}

export const toProviderAnswers = (
  questions: ReadonlyArray<UserInputQuestion> | undefined,
  draft: DraftAnswers,
  legacyFreeform: string,
): ProviderUserInputAnswers => {
  if (questions === undefined || questions.length === 0) {
    const trimmed = legacyFreeform.trim()
    return trimmed.length === 0 ? {} : { [LEGACY_ANSWER_KEY]: { optionIds: [], freeform: trimmed } }
  }
  const entries: Array<[string, UserInputAnswer]> = []
  for (const question of questions) {
    const answer = draft[question.id] ?? emptyUserInputAnswer()
    entries.push([question.id, withOptionalFreeform(answer.optionIds, answer.freeform)])
  }
  return Object.fromEntries(entries)
}

export const formatResolvedUserInputAnswer = (
  question: UserInputQuestion,
  answer: UserInputAnswer | undefined,
): string => {
  if (answer === undefined) {
    return "—"
  }
  const labels = answer.optionIds.flatMap((optionId) => {
    const option = question.options.find((candidate) => candidate.id === optionId)
    return option === undefined ? [] : [option.label]
  })
  const freeform = answer.freeform?.trim()
  if (freeform !== undefined && freeform.length > 0) {
    labels.push(freeform)
  }
  return labels.length === 0 ? "—" : labels.join(", ")
}

export { LEGACY_ANSWER_KEY }
