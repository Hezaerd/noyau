import type { GitDraftKind } from "@noyau/protocol/git"
import { Context, Effect, Layer, Schema } from "effect"

export class TextGenerationError extends Schema.TaggedError<TextGenerationError>()(
  "TextGenerationError",
  {
    operation: Schema.Literals(["generateThreadTitle", "generateGitDraft", "generateBranchName"]),
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

export interface GitDraftGenerationInput {
  readonly cwd: string
  readonly kind: GitDraftKind
  readonly context: string
}

export interface GitDraftGenerationResult {
  readonly title: string
  readonly body?: string
}

export interface BranchNameGenerationInput {
  readonly cwd: string
  readonly message: string
}

export interface BranchNameGenerationResult {
  readonly branch: string
}

export interface TextGenerationService {
  readonly generateThreadTitle: (
    input: ThreadTitleGenerationInput,
  ) => Effect.Effect<ThreadTitleGenerationResult, TextGenerationError>
  readonly generateGitDraft: (
    input: GitDraftGenerationInput,
  ) => Effect.Effect<GitDraftGenerationResult, TextGenerationError>
  readonly generateBranchName: (
    input: BranchNameGenerationInput,
  ) => Effect.Effect<BranchNameGenerationResult, TextGenerationError>
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
  generateGitDraft: () =>
    Effect.fail(
      new TextGenerationError({
        operation: "generateGitDraft",
        detail: "Text generation is unavailable",
      }),
    ),
  generateBranchName: () =>
    Effect.fail(
      new TextGenerationError({
        operation: "generateBranchName",
        detail: "Text generation is unavailable",
      }),
    ),
})
