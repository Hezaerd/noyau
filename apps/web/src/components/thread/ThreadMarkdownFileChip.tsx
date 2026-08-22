import type { FilePreview } from "@noyau/protocol/file-preview"
import { useEffect, useState } from "react"

import { PierreEntryIcon } from "@/components/PierreEntryIcon"
import { useThreadMarkdownFileLinks } from "@/components/thread/thread-markdown-context"
import { ThreadFilePreviewText } from "@/components/thread/ThreadFilePreviewText"
import { PreviewCard, PreviewCardPopup, PreviewCardTrigger } from "@/components/ui/preview-card"
import { Spinner } from "@/components/ui/spinner"
import { toastManager } from "@/components/ui/toast"
import { FILE_CHIP_ICON_CLASS_NAME, TRANSCRIPT_FILE_CHIP_CLASS_NAME } from "@/lib/file-chip"
import { loadFilePreview, peekFilePreview } from "@/lib/file-preview"
import { createImagePreviewUrl } from "@/lib/image-preview-url"
import {
  encodeThreadMarkdownFileHref,
  fileLinkChipLabel,
  type MarkdownFileLinkMeta,
} from "@/lib/markdown-file-links"
import { openFilesystemPath } from "@/lib/open-path"
import { inferEntryKindFromPath } from "@/lib/pierre-icons"
import { cn } from "@/lib/utils"

const PREVIEW_DELAY_MS = import.meta.env.MODE === "test" ? 0 : 400
const PREVIEW_CLOSE_DELAY_MS = import.meta.env.MODE === "test" ? 0 : 200

const openFileChip = (path: string): void => {
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

export function ThreadMarkdownFileChip({
  meta,
  parentSuffix,
  className,
}: {
  readonly meta: MarkdownFileLinkMeta
  readonly parentSuffix: string | undefined
  readonly className?: string | undefined
}) {
  const fileLinks = useThreadMarkdownFileLinks()
  const label = fileLinkChipLabel(meta, parentSuffix)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<FilePreview | undefined>()
  const [imageUrl, setImageUrl] = useState<string>()

  useEffect(() => {
    if (!open) {
      return
    }
    const projectId = fileLinks.projectId
    if (projectId === undefined) {
      setPreview(undefined)
      setLoading(false)
      return
    }
    const cached = peekFilePreview(projectId, meta.filePath)
    if (cached !== undefined) {
      setPreview(cached)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void loadFilePreview(projectId, meta.filePath).then((value) => {
      if (cancelled) {
        return undefined
      }
      setPreview(value)
      setLoading(false)
      return undefined
    })
    return () => {
      cancelled = true
    }
  }, [fileLinks.projectId, meta.filePath, open])

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

  const pending = loading && preview === undefined
  const textPreview = preview?.kind === "text" ? preview : undefined
  const showImage = preview?.kind === "image" && imageUrl !== undefined
  const statusLabel = pending
    ? undefined
    : textPreview?.truncated === true
      ? "Aperçu tronqué"
      : textPreview === undefined && !showImage
        ? "Aperçu indisponible"
        : undefined

  return (
    <PreviewCard
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
      }}
    >
      <PreviewCardTrigger
        closeDelay={PREVIEW_CLOSE_DELAY_MS}
        delay={PREVIEW_DELAY_MS}
        href={encodeThreadMarkdownFileHref(meta.filePath)}
        className={cn(className, TRANSCRIPT_FILE_CHIP_CLASS_NAME)}
        data-thread-markdown-file-chip=""
        aria-label={`Ouvrir ${meta.displayPath}`}
        onClick={(event) => {
          event.preventDefault()
          openFileChip(meta.filePath)
        }}
      >
        <PierreEntryIcon
          pathValue={meta.filePath}
          kind={inferEntryKindFromPath(meta.filePath)}
          className={FILE_CHIP_ICON_CLASS_NAME}
        />
        <span className="truncate leading-tight">{label}</span>
      </PreviewCardTrigger>
      <PreviewCardPopup
        className="flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0 text-pretty"
        side="top"
      >
        <div className="border-b px-3 py-2 font-mono text-[11px] leading-tight text-muted-foreground">
          <p className="truncate">{meta.displayPath}</p>
        </div>
        <div className="max-h-64 overflow-auto p-3">
          {pending ? (
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Spinner aria-label="Chargement de l'aperçu" className="size-3.5" />
              <span>Chargement de l'aperçu…</span>
            </div>
          ) : null}
          {textPreview === undefined ? null : (
            <ThreadFilePreviewText path={meta.filePath} text={textPreview.text} />
          )}
          {showImage ? (
            <img
              alt=""
              className="max-h-32 max-w-full rounded-lg object-contain object-left"
              src={imageUrl}
            />
          ) : null}
          {statusLabel === undefined ? null : (
            <p className="text-muted-foreground text-xs">{statusLabel}</p>
          )}
        </div>
      </PreviewCardPopup>
    </PreviewCard>
  )
}
