import type { TurnImageAttachment } from "@noyau/protocol/entities/attachment"
import { useEffect, useState } from "react"

import { ImageThumbnail } from "@/components/thread/ImageThumbnail"
import { previewAttachment } from "@/lib/control-plane"
import { createImagePreviewUrl } from "@/lib/image-preview-url"

function ThreadTurnImage({ attachment }: { readonly attachment: TurnImageAttachment }) {
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
      return undefined
    })
    return () => {
      cancelled = true
      if (createdUrl !== undefined) {
        URL.revokeObjectURL(createdUrl)
      }
    }
  }, [attachment.id])

  return <ImageThumbnail alt={attachment.name} src={url} />
}

export function ThreadTurnImages({
  attachments,
}: {
  readonly attachments: ReadonlyArray<TurnImageAttachment>
}) {
  if (attachments.length === 0) {
    return null
  }
  return (
    <div className="flex flex-wrap justify-start gap-1.5">
      {attachments.map((attachment) => (
        <ThreadTurnImage key={attachment.id} attachment={attachment} />
      ))}
    </div>
  )
}
