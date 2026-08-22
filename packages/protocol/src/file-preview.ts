import { Schema } from "effect"

import { ProjectId } from "./ids.ts"

export const FilePreviewImageMime = Schema.Literals([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
])
export type FilePreviewImageMime = (typeof FilePreviewImageMime)["Type"]

export const FilePreviewUnsupportedReason = Schema.Literals([
  "binary",
  "too-large",
  "directory",
  "empty",
])
export type FilePreviewUnsupportedReason = (typeof FilePreviewUnsupportedReason)["Type"]

export const FilePreviewFailedReason = Schema.Literals([
  "not-found",
  "outside-workspace",
  "unreadable",
])
export type FilePreviewFailedReason = (typeof FilePreviewFailedReason)["Type"]

export class FilePreviewFailed extends Schema.TaggedError<FilePreviewFailed>()(
  "FilePreviewFailed",
  {
    reason: FilePreviewFailedReason,
  },
) {}

const previewClock = {
  mtimeMs: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
} as const

export const FilePreviewText = Schema.Struct({
  kind: Schema.Literal("text"),
  text: Schema.String,
  truncated: Schema.Boolean,
  ...previewClock,
})
export type FilePreviewText = (typeof FilePreviewText)["Type"]

export const FilePreviewImage = Schema.Struct({
  kind: Schema.Literal("image"),
  mime: FilePreviewImageMime,
  bytes: Schema.Uint8ArrayFromBase64,
  ...previewClock,
})
export type FilePreviewImage = (typeof FilePreviewImage)["Type"]

export const FilePreviewUnsupported = Schema.Struct({
  kind: Schema.Literal("unsupported"),
  reason: FilePreviewUnsupportedReason,
  ...previewClock,
})
export type FilePreviewUnsupported = (typeof FilePreviewUnsupported)["Type"]

/** Aperçu borné d'un fichier du WorkspaceRoot : texte, image web, ou refus explicite. */
export const FilePreview = Schema.Union([FilePreviewText, FilePreviewImage, FilePreviewUnsupported])
export type FilePreview = (typeof FilePreview)["Type"]

export const PreviewFileInput = Schema.Struct({
  projectId: ProjectId,
  path: Schema.NonEmptyString,
})
export type PreviewFileInput = (typeof PreviewFileInput)["Type"]
