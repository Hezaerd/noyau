import * as AcpSchema from "@noyau/acp/schema"
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

const CursorAvailableModel = Schema.Struct({
  value: Schema.String,
  name: Schema.String,
  configOptions: Schema.optionalKey(Schema.Array(AcpSchema.SessionConfigOption)),
})

export const CursorListAvailableModelsResponse = Schema.Struct({
  models: Schema.Array(CursorAvailableModel),
})
export type CursorListAvailableModelsResponse = typeof CursorListAvailableModelsResponse.Type
