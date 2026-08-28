import { AttachmentPreviewFailed } from "@noyau/contracts/attachment-preview"
import type { ClientCommandRequest } from "@noyau/contracts/commands"
import type {
  TurnImageAttachment,
  TurnImageMime,
  TurnImageUpload,
} from "@noyau/contracts/entities/attachment"
import {
  attachmentIdFor,
  isTurnImageMime,
  TURN_MAX_IMAGE_BYTES,
} from "@noyau/contracts/entities/attachment"
import { ServiceUnavailable } from "@noyau/contracts/errors"
import { CommandId } from "@noyau/contracts/ids"
import { ImageAttachmentRejected } from "@noyau/contracts/thread/errors"
import { Effect, FileSystem, Path } from "effect"

import { ServerConfig } from "./config.ts"

const EXTENSION_BY_MIME = {
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
} as const satisfies Record<TurnImageMime, string>

const MIME_BY_EXTENSION = {
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
} as const satisfies Record<string, TurnImageMime>

const isBase64Char = (code: number): boolean =>
  (code >= 0x61 && code <= 0x7a) ||
  (code >= 0x41 && code <= 0x5a) ||
  (code >= 0x30 && code <= 0x39) ||
  code === 0x2b ||
  code === 0x2f ||
  code === 0x3d

const isBase64Whitespace = (code: number): boolean =>
  code === 0x0d || code === 0x0a || code === 0x20

/** Parse un data URL base64 sans regex sur le payload (stack overflow V8). */
export const parseBase64DataUrl = (
  dataUrl: string,
): { readonly mimeType: string; readonly base64: string } | null => {
  const trimmed = dataUrl.trim()
  if (trimmed.slice(0, 5).toLowerCase() !== "data:") {
    return null
  }
  const commaIndex = trimmed.indexOf(",")
  if (commaIndex === -1) {
    return null
  }
  const headerParts = trimmed
    .slice(5, commaIndex)
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (headerParts.length < 2 || headerParts.at(-1)?.toLowerCase() !== "base64") {
    return null
  }
  const mimeType = headerParts[0]?.toLowerCase()
  if (mimeType === undefined || mimeType.length === 0) {
    return null
  }
  const payload = trimmed.slice(commaIndex + 1)
  let compact = ""
  for (let index = 0; index < payload.length; index += 1) {
    const code = payload.charCodeAt(index)
    if (isBase64Whitespace(code)) {
      continue
    }
    if (!isBase64Char(code)) {
      return null
    }
    compact += payload[index]
  }
  if (compact.length === 0 || compact.length % 4 !== 0) {
    return null
  }
  return { mimeType, base64: compact }
}

export const attachmentsDirectory = (dataDirectory: string, pathApi: Path.Path): string =>
  pathApi.join(dataDirectory, "attachments")

const attachmentFileName = (attachment: TurnImageAttachment): string =>
  `${attachment.id}${EXTENSION_BY_MIME[attachment.mimeType]}`

export const resolveAttachmentPath = (
  attachmentsDir: string,
  attachment: TurnImageAttachment,
  pathApi: Path.Path,
): string | null => {
  const root = pathApi.resolve(attachmentsDir)
  const resolved = pathApi.resolve(root, attachmentFileName(attachment))
  return resolved === root || resolved.startsWith(`${root}${pathApi.sep}`) ? resolved : null
}

const decodeUpload = (
  upload: TurnImageUpload,
): { readonly mimeType: TurnImageMime; readonly bytes: Uint8Array } | null => {
  const parsed = parseBase64DataUrl(upload.dataUrl)
  if (parsed === null || !isTurnImageMime(parsed.mimeType)) {
    return null
  }
  if (parsed.mimeType !== upload.mimeType) {
    return null
  }
  const bytes = Buffer.from(parsed.base64, "base64")
  if (bytes.byteLength === 0 || bytes.byteLength > TURN_MAX_IMAGE_BYTES) {
    return null
  }
  return { mimeType: parsed.mimeType, bytes }
}

export const persistTurnUploads = Effect.fn("Attachments.persistTurnUploads")(function* (
  request: Extract<ClientCommandRequest, { readonly _tag: "thread.turn.start" }>,
): Effect.fn.Return<
  ReadonlyArray<TurnImageAttachment> | undefined,
  ImageAttachmentRejected | ServiceUnavailable,
  FileSystem.FileSystem | Path.Path | ServerConfig
> {
  if (request.payload.attachments === undefined) {
    return undefined
  }
  const fileSystem = yield* FileSystem.FileSystem
  const pathApi = yield* Path.Path
  const config = yield* ServerConfig
  const attachmentsDir = attachmentsDirectory(config.dataDirectory, pathApi)
  yield* fileSystem
    .makeDirectory(attachmentsDir, { recursive: true })
    .pipe(Effect.mapError(() => new ServiceUnavailable({ service: "filesystem" })))

  const persisted: Array<TurnImageAttachment> = []
  for (const [index, upload] of request.payload.attachments.entries()) {
    const decoded = decodeUpload(upload)
    if (decoded === null) {
      return yield* new ImageAttachmentRejected({ threadId: request.payload.threadId })
    }
    const attachment: TurnImageAttachment = {
      type: "image",
      id: attachmentIdFor(CommandId.make(request.commandId), index),
      name: upload.name,
      mimeType: decoded.mimeType,
      sizeBytes: decoded.bytes.byteLength,
    }
    const target = resolveAttachmentPath(attachmentsDir, attachment, pathApi)
    if (target === null) {
      return yield* new ImageAttachmentRejected({ threadId: request.payload.threadId })
    }
    yield* fileSystem
      .writeFile(target, decoded.bytes)
      .pipe(Effect.mapError(() => new ServiceUnavailable({ service: "filesystem" })))
    persisted.push(attachment)
  }
  return persisted
})

export const loadTurnAttachments = Effect.fn("Attachments.loadTurnAttachments")(function* (
  attachments: ReadonlyArray<TurnImageAttachment>,
): Effect.fn.Return<
  ReadonlyArray<TurnImageAttachment & { readonly data: Uint8Array }>,
  ServiceUnavailable,
  FileSystem.FileSystem | Path.Path | ServerConfig
> {
  const fileSystem = yield* FileSystem.FileSystem
  const pathApi = yield* Path.Path
  const config = yield* ServerConfig
  const attachmentsDir = attachmentsDirectory(config.dataDirectory, pathApi)
  const loaded: Array<TurnImageAttachment & { readonly data: Uint8Array }> = []
  for (const attachment of attachments) {
    const target = resolveAttachmentPath(attachmentsDir, attachment, pathApi)
    if (target === null) {
      return yield* new ServiceUnavailable({ service: "filesystem" })
    }
    const bytes = yield* fileSystem
      .readFile(target)
      .pipe(Effect.mapError(() => new ServiceUnavailable({ service: "filesystem" })))
    loaded.push({ ...attachment, data: bytes })
  }
  return loaded
})

export const readAttachmentPreview = Effect.fn("Attachments.readAttachmentPreview")(function* (
  attachmentId: string,
): Effect.fn.Return<
  { readonly mime: TurnImageMime; readonly bytes: Uint8Array },
  AttachmentPreviewFailed,
  FileSystem.FileSystem | Path.Path | ServerConfig
> {
  const fileSystem = yield* FileSystem.FileSystem
  const pathApi = yield* Path.Path
  const config = yield* ServerConfig
  const attachmentsDir = attachmentsDirectory(config.dataDirectory, pathApi)
  const root = pathApi.resolve(attachmentsDir)
  for (const [extension, mime] of Object.entries(MIME_BY_EXTENSION)) {
    const resolved = pathApi.resolve(root, `${attachmentId}${extension}`)
    if (resolved === root || !resolved.startsWith(`${root}${pathApi.sep}`)) {
      continue
    }
    const exists = yield* fileSystem
      .exists(resolved)
      .pipe(Effect.mapError(() => new AttachmentPreviewFailed({ reason: "unreadable" })))
    if (!exists) {
      continue
    }
    const bytes = yield* fileSystem
      .readFile(resolved)
      .pipe(Effect.mapError(() => new AttachmentPreviewFailed({ reason: "unreadable" })))
    return { mime, bytes }
  }
  return yield* new AttachmentPreviewFailed({ reason: "not-found" })
})
