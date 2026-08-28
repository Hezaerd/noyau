import type { CommandId } from "@noyau/contracts/ids"
import { AttachmentId } from "@noyau/contracts/ids"
import { Schema } from "effect"

export const TURN_MAX_ATTACHMENTS = 8
export const TURN_MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const TURN_MAX_IMAGE_DATA_URL_CHARS = 14_000_000

export const TURN_IMAGE_MIME_TYPES = ["image/gif", "image/jpeg", "image/png", "image/webp"] as const

export const TurnImageMime = Schema.Literals(TURN_IMAGE_MIME_TYPES)
export type TurnImageMime = (typeof TurnImageMime)["Type"]

const TURN_IMAGE_MIME_SET = new Set<string>(TURN_IMAGE_MIME_TYPES)

export const isTurnImageMime = (mimeType: string): mimeType is TurnImageMime =>
  TURN_IMAGE_MIME_SET.has(mimeType.toLowerCase())

const TurnImageSizeBytes = Schema.Int.check(
  Schema.makeFilter((value: number) => value > 0 && value <= TURN_MAX_IMAGE_BYTES, {
    expected: `an image size between 1 and ${TURN_MAX_IMAGE_BYTES} bytes`,
  }),
)

const TurnImageName = Schema.NonEmptyString.check(Schema.isMaxLength(255))

/** Meta durable d'une image jointe à un Turn. Les octets vivent hors journal. */
export const TurnImageAttachment = Schema.Struct({
  type: Schema.Literal("image"),
  id: AttachmentId,
  name: TurnImageName,
  mimeType: TurnImageMime,
  sizeBytes: TurnImageSizeBytes,
})
export type TurnImageAttachment = (typeof TurnImageAttachment)["Type"]

/** Image qui traverse `thread.turn.start` une seule fois. */
export const TurnImageUpload = Schema.Struct({
  type: Schema.Literal("image"),
  name: TurnImageName,
  mimeType: TurnImageMime,
  sizeBytes: TurnImageSizeBytes,
  dataUrl: Schema.NonEmptyString.check(Schema.isMaxLength(TURN_MAX_IMAGE_DATA_URL_CHARS)),
})
export type TurnImageUpload = (typeof TurnImageUpload)["Type"]

export const TurnImageAttachments = Schema.Array(TurnImageAttachment).check(
  Schema.isMaxLength(TURN_MAX_ATTACHMENTS),
)
export type TurnImageAttachments = (typeof TurnImageAttachments)["Type"]

export const TurnImageUploads = Schema.Array(TurnImageUpload).check(
  Schema.isMaxLength(TURN_MAX_ATTACHMENTS),
)
export type TurnImageUploads = (typeof TurnImageUploads)["Type"]

export const attachmentIdFor = (commandId: CommandId, index: number): AttachmentId =>
  AttachmentId.make(`${commandId}-${index}`)

export const turnHasPrompt = (value: {
  readonly text?: string
  readonly attachments?: ReadonlyArray<unknown>
}): boolean =>
  (value.text !== undefined && value.text.trim().length > 0) ||
  (value.attachments !== undefined && value.attachments.length > 0)
