import type { FilePreview } from "@noyau/contracts/file-preview"
import type { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { useEffect, useState, type ComponentProps } from "react"
import type { ExtraProps } from "streamdown"

import { ExpandedImageDialog } from "@/components/thread/ExpandedImageDialog"
import { ImageThumbnail } from "@/components/thread/ImageThumbnail"
import { useThreadMarkdownFileLinks } from "@/components/thread/thread-markdown-context"
import { ThreadMarkdownFileChip } from "@/components/thread/ThreadMarkdownFileChip"
import { loadFilePreview, peekFilePreview } from "@/lib/file-preview"
import { createImagePreviewUrl } from "@/lib/image-preview-url"
import { fileLinkSuffixKey, lookupThreadMarkdownFileLinkMeta } from "@/lib/markdown-file-links"

interface ScopedPreview {
  readonly projectId: ProjectId
  readonly threadId: ThreadId | undefined
  readonly path: string
  readonly value: FilePreview | undefined
}

interface PreviewImageUrl {
  readonly preview: FilePreview
  readonly url: string
}

export function ThreadMarkdownImage({ src, alt, node: _node }: ComponentProps<"img"> & ExtraProps) {
  const fileLinks = useThreadMarkdownFileLinks()
  const meta = lookupThreadMarkdownFileLinkMeta(src, fileLinks)
  const filePath = meta?.filePath
  const [loadedPreview, setLoadedPreview] = useState<ScopedPreview>()
  const [loadedImageUrl, setLoadedImageUrl] = useState<PreviewImageUrl>()
  const [expanded, setExpanded] = useState(false)
  const preview =
    loadedPreview !== undefined &&
    loadedPreview.projectId === fileLinks.projectId &&
    loadedPreview.threadId === fileLinks.threadId &&
    loadedPreview.path === filePath
      ? loadedPreview.value
      : undefined
  const imageUrl =
    loadedImageUrl !== undefined && loadedImageUrl.preview === preview
      ? loadedImageUrl.url
      : undefined

  useEffect(() => {
    if (filePath === undefined) {
      setLoadedPreview(undefined)
      return
    }
    const projectId = fileLinks.projectId
    if (projectId === undefined) {
      setLoadedPreview(undefined)
      return
    }
    const scope = { projectId, threadId: fileLinks.threadId, path: filePath }
    const cached = peekFilePreview(projectId, fileLinks.threadId, filePath)
    if (cached !== undefined) {
      setLoadedPreview({ ...scope, value: cached })
      return
    }
    let cancelled = false
    void loadFilePreview(projectId, fileLinks.threadId, filePath).then((value) => {
      if (!cancelled) {
        setLoadedPreview({ ...scope, value })
      }
      return undefined
    })
    return () => {
      cancelled = true
    }
  }, [fileLinks.projectId, fileLinks.threadId, filePath])

  useEffect(() => {
    if (preview?.kind !== "image") {
      return
    }
    const url = createImagePreviewUrl(preview.bytes, preview.mime)
    setLoadedImageUrl({ preview, url })
    return () => {
      URL.revokeObjectURL(url)
      setLoadedImageUrl(undefined)
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
