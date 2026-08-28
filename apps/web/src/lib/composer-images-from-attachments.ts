import type { TurnImageAttachment } from "@noyau/contracts/entities/attachment"

import { composerImageFromBytes, type ComposerImage } from "./composer-images"
import { previewAttachment } from "./control-plane"

export const loadComposerImagesFromAttachments = async (
  attachments: ReadonlyArray<TurnImageAttachment> | undefined,
): Promise<ReadonlyArray<ComposerImage>> => {
  if (attachments === undefined || attachments.length === 0) {
    return []
  }
  const previews = await Promise.all(
    attachments.map((attachment) =>
      previewAttachment({ attachmentId: attachment.id }).then((preview) => ({
        attachment,
        preview,
      })),
    ),
  )
  const images: Array<ComposerImage> = []
  for (const { attachment, preview } of previews) {
    if (!preview.ok) {
      continue
    }
    const image = composerImageFromBytes({
      name: attachment.name,
      mimeType: attachment.mimeType,
      bytes: preview.value.bytes,
    })
    if (image !== undefined) {
      images.push(image)
    }
  }
  return images
}
