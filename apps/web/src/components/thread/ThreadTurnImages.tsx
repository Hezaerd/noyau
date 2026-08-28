import type { TurnImageAttachment } from "@noyau/contracts/entities/attachment"
import { useCallback, useEffect, useState } from "react"

import { ExpandedImageDialog } from "@/components/thread/ExpandedImageDialog"
import { ImageThumbnail } from "@/components/thread/ImageThumbnail"
import { previewAttachment } from "@/lib/control-plane"
import { buildExpandedImagePreview, type ExpandedImagePreview } from "@/lib/expanded-image-preview"
import { createImagePreviewUrl } from "@/lib/image-preview-url"

function ThreadTurnImage({
  attachment,
  onReady,
  onExpand,
}: {
  readonly attachment: TurnImageAttachment
  readonly onReady: (attachmentId: string, url: string | undefined) => void
  readonly onExpand: (attachmentId: string) => void
}) {
  const [url, setUrl] = useState<string>()

  useEffect(() => {
    let cancelled = false
    let createdUrl: string | undefined
    void previewAttachment({ attachmentId: attachment.id }).then((result) => {
      if (cancelled || !result.ok) {
        return undefined
      }
      createdUrl = createImagePreviewUrl(result.value.bytes, result.value.mime)
      setUrl(createdUrl)
      onReady(attachment.id, createdUrl)
      return undefined
    })
    return () => {
      cancelled = true
      onReady(attachment.id, undefined)
      if (createdUrl !== undefined) {
        URL.revokeObjectURL(createdUrl)
      }
    }
  }, [attachment.id, onReady])

  return (
    <ImageThumbnail
      alt={attachment.name}
      src={url}
      onExpand={
        url === undefined
          ? undefined
          : () => {
              onExpand(attachment.id)
            }
      }
    />
  )
}

export function ThreadTurnImages({
  attachments,
}: {
  readonly attachments: ReadonlyArray<TurnImageAttachment>
}) {
  const [previewUrls, setPreviewUrls] = useState<Readonly<Record<string, string>>>({})
  const [expandedImage, setExpandedImage] = useState<ExpandedImagePreview | null>(null)

  const onReady = useCallback((attachmentId: string, url: string | undefined) => {
    setPreviewUrls((current) => {
      if (url === undefined) {
        if (!(attachmentId in current)) {
          return current
        }
        const next = { ...current }
        delete next[attachmentId]
        return next
      }
      if (current[attachmentId] === url) {
        return current
      }
      return { ...current, [attachmentId]: url }
    })
  }, [])

  const expand = (attachmentId: string) => {
    const preview = buildExpandedImagePreview(
      attachments.map((attachment) => ({
        id: attachment.id,
        name: attachment.name,
        previewUrl: previewUrls[attachment.id],
      })),
      attachmentId,
    )
    if (preview !== null) {
      setExpandedImage(preview)
    }
  }

  if (attachments.length === 0) {
    return null
  }
  return (
    <>
      <div className="flex flex-wrap justify-start gap-1.5">
        {attachments.map((attachment) => (
          <ThreadTurnImage
            key={attachment.id}
            attachment={attachment}
            onReady={onReady}
            onExpand={expand}
          />
        ))}
      </div>
      {expandedImage === null ? null : (
        <ExpandedImageDialog
          preview={expandedImage}
          onClose={() => {
            setExpandedImage(null)
          }}
        />
      )}
    </>
  )
}
