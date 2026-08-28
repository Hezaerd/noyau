import type { FilePreview } from "@noyau/contracts/file-preview"
import { useEffect, useState, type ComponentProps } from "react"
import type { ExtraProps } from "streamdown"

import { ExpandedImageDialog } from "@/components/thread/ExpandedImageDialog"
import { ImageThumbnail } from "@/components/thread/ImageThumbnail"
import { useThreadMarkdownFileLinks } from "@/components/thread/thread-markdown-context"
import { ThreadMarkdownFileChip } from "@/components/thread/ThreadMarkdownFileChip"
import { loadFilePreview, peekFilePreview } from "@/lib/file-preview"
import { createImagePreviewUrl } from "@/lib/image-preview-url"
import { fileLinkSuffixKey, lookupThreadMarkdownFileLinkMeta } from "@/lib/markdown-file-links"

export function ThreadMarkdownImage({ src, alt, node: _node }: ComponentProps<"img"> & ExtraProps) {
  const fileLinks = useThreadMarkdownFileLinks()
  const meta = lookupThreadMarkdownFileLinkMeta(src, fileLinks)
  const filePath = meta?.filePath
  const [preview, setPreview] = useState<FilePreview | undefined>()
  const [imageUrl, setImageUrl] = useState<string>()
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (filePath === undefined) {
      setPreview(undefined)
      return
    }
    const projectId = fileLinks.projectId
    if (projectId === undefined) {
      setPreview(undefined)
      return
    }
    const cached = peekFilePreview(projectId, filePath)
    if (cached !== undefined) {
      setPreview(cached)
      return
    }
    let cancelled = false
    void loadFilePreview(projectId, filePath).then((value) => {
      if (!cancelled) {
        setPreview(value)
      }
      return undefined
    })
    return () => {
      cancelled = true
    }
  }, [fileLinks.projectId, filePath])

  useEffect(() => {
    if (preview?.kind !== "image") {
      return
    }
    const url = createImagePreviewUrl(preview.bytes, preview.mime)
    setImageUrl(url)
    return () => {
      URL.revokeObjectURL(url)
      setImageUrl(undefined)
    }
  }, [preview])

  const remoteSrc = meta === undefined ? src : undefined
  const expandSrc = imageUrl ?? remoteSrc
  const expandName =
    alt === undefined || alt === "" ? (meta === undefined ? "Image" : meta.basename) : alt

  const expand =
    expandSrc === undefined || expandSrc === ""
      ? undefined
      : () => {
          setExpanded(true)
        }

  const dialog =
    expanded && expandSrc !== undefined && expandSrc !== "" ? (
      <ExpandedImageDialog
        preview={{ images: [{ src: expandSrc, name: expandName }], index: 0 }}
        onClose={() => {
          setExpanded(false)
        }}
      />
    ) : null

  if (meta === undefined) {
    if (src === undefined || src === "") {
      return null
    }
    return (
      <span className="inline-flex align-middle">
        <ImageThumbnail alt={expandName} src={src} onExpand={expand} />
        {dialog}
      </span>
    )
  }

  if (preview !== undefined && preview.kind !== "image") {
    return (
      <ThreadMarkdownFileChip
        meta={meta}
        parentSuffix={fileLinks.parentSuffixByPath.get(fileLinkSuffixKey(meta))}
      />
    )
  }

  return (
    <span className="inline-flex align-middle">
      <ImageThumbnail alt={expandName} src={imageUrl} onExpand={expand} />
      {dialog}
    </span>
  )
}
