import type { FilePreview } from "@noyau/protocol/file-preview"
import { useEffect, useState, type ComponentProps } from "react"
import type { ExtraProps } from "streamdown"

import { ImageThumbnail } from "@/components/thread/ImageThumbnail"
import { useThreadMarkdownFileLinks } from "@/components/thread/thread-markdown-context"
import { ThreadMarkdownFileChip } from "@/components/thread/ThreadMarkdownFileChip"
import { toastManager } from "@/components/ui/toast"
import { loadFilePreview, peekFilePreview } from "@/lib/file-preview"
import { createImagePreviewUrl } from "@/lib/image-preview-url"
import { fileLinkSuffixKey, lookupThreadMarkdownFileLinkMeta } from "@/lib/markdown-file-links"
import { openFilesystemPath } from "@/lib/open-path"

const openLinkedImage = (path: string): void => {
  void openFilesystemPath(path).then(
    () => undefined,
    () => {
      toastManager.add({
        description:
          window.noyauDesktop === undefined
            ? "Disponible dans Noyau Desktop."
            : "Le système n'a pas pu ouvrir ce fichier.",
        title: "Ouverture impossible",
        type: "error",
      })
    },
  )
}

export function ThreadMarkdownImage({ src, alt, node: _node }: ComponentProps<"img"> & ExtraProps) {
  const fileLinks = useThreadMarkdownFileLinks()
  const meta = lookupThreadMarkdownFileLinkMeta(src, fileLinks)
  const filePath = meta?.filePath
  const [preview, setPreview] = useState<FilePreview | undefined>()
  const [imageUrl, setImageUrl] = useState<string>()

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

  if (meta === undefined) {
    if (src === undefined || src === "") {
      return null
    }
    return (
      <span className="inline-flex align-middle">
        <ImageThumbnail alt={alt === undefined || alt === "" ? "Image" : alt} src={src} />
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

  const label = alt === undefined || alt === "" ? meta.basename : alt

  return (
    <span className="inline-flex align-middle">
      <button
        type="button"
        className="inline-flex cursor-pointer rounded-lg align-middle"
        aria-label={`Ouvrir ${meta.displayPath}`}
        onClick={() => {
          openLinkedImage(meta.filePath)
        }}
      >
        <ImageThumbnail alt={label} src={imageUrl} />
      </button>
    </span>
  )
}
