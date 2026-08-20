import { Context, Effect, Layer, Schema } from "effect"

export class TextGenerationError extends Schema.TaggedError<TextGenerationError>()(
  "TextGenerationError",
  {
    operation: Schema.Literals(["generateThreadTitle"]),
    detail: Schema.NonEmptyString,
  },
) {}

export interface ThreadTitleGenerationInput {
  readonly cwd: string
  readonly message: string
  readonly previousTitle?: string
}

export interface ThreadTitleGenerationResult {
  readonly title: string
}

export interface TextGenerationService {
  readonly generateThreadTitle: (
    input: ThreadTitleGenerationInput,
  ) => Effect.Effect<ThreadTitleGenerationResult, TextGenerationError>
}

export class TextGeneration extends Context.Service<TextGeneration, TextGenerationService>()(
  "@noyau/server/text-generation/TextGeneration",
) {}

export const unavailableTextGenerationLayer = Layer.succeed(TextGeneration)({
  generateThreadTitle: () =>
    Effect.fail(
      new TextGenerationError({
        operation: "generateThreadTitle",
        detail: "Text generation is unavailable",
      }),
    ),
})
