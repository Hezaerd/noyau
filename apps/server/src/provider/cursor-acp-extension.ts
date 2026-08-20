import { Schema } from "effect"

const CursorAskQuestionOption = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
})

const CursorAskQuestion = Schema.Struct({
  id: Schema.String,
  prompt: Schema.String,
  options: Schema.Array(CursorAskQuestionOption),
  allowMultiple: Schema.optionalKey(Schema.Boolean),
})

export const CursorAskQuestionRequest = Schema.Struct({
  sessionId: Schema.optionalKey(Schema.String),
  toolCallId: Schema.optionalKey(Schema.String),
  title: Schema.optionalKey(Schema.String),
  questions: Schema.optionalKey(Schema.Array(CursorAskQuestion)),
})
export type CursorAskQuestionRequest = typeof CursorAskQuestionRequest.Type
