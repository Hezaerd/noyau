import {
  isTurnImageMime,
  TURN_MAX_ATTACHMENTS,
  TURN_MAX_IMAGE_BYTES,
  type TurnImageMime,
  type TurnImageUpload,
} from "@noyau/protocol/entities/attachment"

import { createImagePreviewUrl } from "./image-preview-url"

export type ComposerImage = {
  readonly localId: string
  readonly previewUrl: string
  readonly upload: TurnImageUpload
}

export type ComposerImageFailure = "unsupported" | "too-large" | "unreadable" | "limit"

const BASE64_CHUNK = 0x8000

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = ""
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK))
  }
  return btoa(binary)
}

const normalizeMime = (mimeType: string): TurnImageMime | undefined => {
  const normalized = mimeType === "image/jpg" ? "image/jpeg" : mimeType.toLowerCase()
  return isTurnImageMime(normalized) ? normalized : undefined
}

export const filesFromClipboard = (data: DataTransfer): ReadonlyArray<File> =>
  Array.from(data.items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .flatMap((item) => {
      const file = item.getAsFile()
      return file === null ? [] : [file]
    })

export const filesFromFileList = (files: FileList | null): ReadonlyArray<File> =>
  files === null ? [] : Array.from(files).filter((file) => file.type.startsWith("image/"))

export const composerImageFromFile = async (
  file: File,
): Promise<
  | { readonly ok: true; readonly image: ComposerImage }
  | { readonly ok: false; readonly reason: ComposerImageFailure }
> => {
  const mimeType = normalizeMime(file.type)
  if (mimeType === undefined) {
    return { ok: false, reason: "unsupported" }
  }
  if (file.size <= 0) {
    return { ok: false, reason: "unreadable" }
  }
  if (file.size > TURN_MAX_IMAGE_BYTES) {
    return { ok: false, reason: "too-large" }
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > TURN_MAX_IMAGE_BYTES) {
      return { ok: false, reason: "too-large" }
    }
    return {
      ok: true,
      image: {
        localId: `${file.name}-${file.size}-${file.lastModified}`,
        previewUrl: URL.createObjectURL(file),
        upload: {
          type: "image",
          name: file.name.trim() === "" ? "image" : file.name,
          mimeType,
          sizeBytes: bytes.byteLength,
          dataUrl: `data:${mimeType};base64,${bytesToBase64(bytes)}`,
        },
      },
    }
  } catch {
    return { ok: false, reason: "unreadable" }
  }
}

export const appendComposerImages = async (
  current: ReadonlyArray<ComposerImage>,
  files: ReadonlyArray<File>,
): Promise<
  | { readonly ok: true; readonly images: ReadonlyArray<ComposerImage> }
  | {
      readonly ok: false
      readonly reason: ComposerImageFailure
      readonly images: ReadonlyArray<ComposerImage>
    }
> => {
  const remaining = TURN_MAX_ATTACHMENTS - current.length
  if (remaining <= 0) {
    return { ok: false, reason: "limit", images: current }
  }
  const overflow = files.length > remaining
  const converted = await Promise.all(
    files.slice(0, remaining).map((file) => composerImageFromFile(file)),
  )
  const images = [...current]
  for (const result of converted) {
    if (!result.ok) {
      return { ok: false, reason: result.reason, images }
    }
    images.push(result.image)
  }
  return overflow ? { ok: false, reason: "limit", images } : { ok: true, images }
}

export const composerImageFromBytes = (input: {
  readonly name: string
  readonly mimeType: TurnImageMime
  readonly bytes: Uint8Array
}): ComposerImage | undefined => {
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > TURN_MAX_IMAGE_BYTES) {
    return undefined
  }
  const previewUrl = createImagePreviewUrl(input.bytes, input.mimeType)
  return {
    localId: `${input.name}-${input.bytes.byteLength}-${previewUrl}`,
    previewUrl,
    upload: {
      type: "image",
      name: input.name.trim() === "" ? "image" : input.name,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
      dataUrl: `data:${input.mimeType};base64,${bytesToBase64(input.bytes)}`,
    },
  }
}

export const revokeComposerImages = (images: ReadonlyArray<ComposerImage>) => {
  for (const image of images) {
    URL.revokeObjectURL(image.previewUrl)
  }
}

export const composerImageFailureMessage = (reason: ComposerImageFailure): string => {
  switch (reason) {
    case "unsupported":
      return "Ce format d’image n’est pas pris en charge (png, jpeg, gif, webp)."
    case "too-large":
      return "Cette image dépasse 10 Mo."
    case "unreadable":
      return "Cette image n’a pas pu être lue."
    case "limit":
      return `Tu peux joindre au plus ${TURN_MAX_ATTACHMENTS} images.`
  }
}
