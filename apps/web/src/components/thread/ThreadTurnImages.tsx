import type { TurnImageAttachment } from "@noyau/protocol/entities/attachment"
import { useEffect, useState } from "react"

import { previewAttachment } from "@/lib/control-plane"

const imageUrlFromBytes = (bytes: Uint8Array, mime: string): string =>
  URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: mime }))

function ThreadTurnImage({ attachment }: { readonly attachment: TurnImageAttachment }) {
  const [url, setUrl] = useState<string>()

  useEffect(() => {
    let cancelled = false
    let createdUrl: string | undefined
    void previewAttachment({ attachmentId: attachment.id }).then((result) => {
      if (cancelled || !result.ok) {
        return undefined
      }
      createdUrl = imageUrlFromBytes(result.value.bytes, result.value.mime)
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

  if (url === undefined) {
    return (
      <span className="flex size-24 items-center justify-center rounded-md border bg-muted text-muted-foreground text-xs">
        {attachment.name}
      </span>
    )
  }

  return (
    <img
      alt={attachment.name}
      src={url}
      className="max-h-52 max-w-full rounded-md border object-contain"
    />
  )
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
    <div className="flex flex-wrap justify-end gap-2">
      {attachments.map((attachment) => (
        <ThreadTurnImage key={attachment.id} attachment={attachment} />
      ))}
    </div>
  )
}
