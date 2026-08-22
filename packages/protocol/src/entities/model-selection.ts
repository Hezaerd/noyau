import { Schema } from "effect"

/** Préférence durable de modèle Cursor pour les prochains Turns d'un Thread. */
export const ModelSelection = Schema.Struct({
  modelId: Schema.NonEmptyString,
  reasoningEffort: Schema.optionalKey(Schema.NonEmptyString),
  serviceTier: Schema.optionalKey(Schema.NonEmptyString),
  thinking: Schema.optionalKey(Schema.Boolean),
})
export type ModelSelection = (typeof ModelSelection)["Type"]
