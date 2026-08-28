import { Schema } from "effect"

import { Provider } from "./environment.ts"

/** Préférence durable de modèle Cursor pour les prochains Turns d'un Thread. */
export const ModelSelection = Schema.Struct({
  modelId: Schema.NonEmptyString,
  reasoningEffort: Schema.optionalKey(Schema.NonEmptyString),
  serviceTier: Schema.optionalKey(Schema.NonEmptyString),
  thinking: Schema.optionalKey(Schema.Boolean),
})
export type ModelSelection = (typeof ModelSelection)["Type"]

/** Modèle préféré d'un Project pour initialiser ses nouveaux Threads. */
export const DefaultModelSelection = Schema.Struct({
  provider: Provider,
  modelSelection: ModelSelection,
})
export type DefaultModelSelection = (typeof DefaultModelSelection)["Type"]
