import { Schema } from "effect"

import { TurnImageMime } from "./entities/attachment.ts"
import { AttachmentId } from "./ids.ts"

export const AttachmentPreviewFailedReason = Schema.Literals(["not-found", "unreadable"])
export type AttachmentPreviewFailedReason = (typeof AttachmentPreviewFailedReason)["Type"]

export class AttachmentPreviewFailed extends Schema.TaggedError<AttachmentPreviewFailed>()(
  "AttachmentPreviewFailed",
  {
    reason: AttachmentPreviewFailedReason,
  },
) {}

/** Aperçu borné d'une pièce jointe persistée hors journal. */
export const AttachmentPreview = Schema.Struct({
  kind: Schema.Literal("image"),
  mime: TurnImageMime,
  bytes: Schema.Uint8ArrayFromBase64,
})
export type AttachmentPreview = (typeof AttachmentPreview)["Type"]

export const PreviewAttachmentInput = Schema.Struct({
  attachmentId: AttachmentId,
})
export type PreviewAttachmentInput = (typeof PreviewAttachmentInput)["Type"]
