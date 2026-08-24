import { Schema } from "effect"

export const ProviderApprovalDecision = Schema.Literals([
  "accept",
  "acceptForSession",
  "decline",
  "cancel",
])
export type ProviderApprovalDecision = (typeof ProviderApprovalDecision)["Type"]

export const UserInputOption = Schema.Struct({
  id: Schema.NonEmptyString,
  label: Schema.NonEmptyString,
})
export type UserInputOption = (typeof UserInputOption)["Type"]

export const UserInputQuestion = Schema.Struct({
  id: Schema.NonEmptyString,
  prompt: Schema.NonEmptyString,
  options: Schema.Array(UserInputOption).check(Schema.isMinLength(2)),
  allowMultiple: Schema.optionalKey(Schema.Boolean),
})
export type UserInputQuestion = (typeof UserInputQuestion)["Type"]

/** Réponse structurée à une question : options cochées et/ou freeform Other. */
export const UserInputAnswer = Schema.Struct({
  optionIds: Schema.Array(Schema.NonEmptyString),
  freeform: Schema.optionalKey(Schema.NonEmptyString),
})
export type UserInputAnswer = (typeof UserInputAnswer)["Type"]

/** Clé = `UserInputQuestion.id` (ou `"answer"` pour le legacy texte libre). */
export const ProviderUserInputAnswers = Schema.Record(Schema.String, UserInputAnswer)
export type ProviderUserInputAnswers = (typeof ProviderUserInputAnswers)["Type"]
