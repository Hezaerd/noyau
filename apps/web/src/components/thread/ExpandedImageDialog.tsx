import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { memo, useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@/components/ui/dialog"
import type { ExpandedImagePreview } from "@/lib/expanded-image-preview"

export const ExpandedImageDialog = memo(function ExpandedImageDialog({
  preview,
  onClose,
}: {
  readonly preview: ExpandedImagePreview
  readonly onClose: () => void
}) {
  const [imageOffset, setImageOffset] = useState(0)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const index = (preview.index + imageOffset + preview.images.length) % preview.images.length

  useEffect(() => {
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => {
      restoreFocusRef.current?.focus()
    }
  }, [])

  const navigateImage = useCallback((direction: -1 | 1) => {
    setImageOffset((current) => current + direction)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (preview.images.length <= 1) {
        return
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        event.stopPropagation()
        navigateImage(-1)
        return
      }
      if (event.key !== "ArrowRight") {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      navigateImage(1)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [navigateImage, onClose, preview.images.length])

  const item = preview.images[index]
  if (item === undefined) {
    return null
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPopup
        bottomStickOnMobile={false}
        showCloseButton
        closeProps={{ "aria-label": "Close preview" }}
        className="relative max-h-[calc(100dvh-2rem)] max-w-[min(92vw,72rem)] p-3 [-webkit-app-region:no-drag]"
      >
        <DialogTitle className="sr-only">Enlarged preview: {item.name}</DialogTitle>
        <DialogDescription className="sr-only">
          Use the left and right arrow keys to browse images. Press Escape to close the preview.
        </DialogDescription>
        {preview.images.length > 1 ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="absolute top-1/2 left-5 z-20 -translate-y-1/2 sm:left-6"
            aria-label="Previous image"
            onClick={() => {
              navigateImage(-1)
            }}
          >
            <ChevronLeftIcon />
          </Button>
        ) : null}
        <div className="relative flex max-h-[calc(100dvh-3.5rem)] max-w-full flex-col items-center">
          <img
            src={item.src}
            alt={item.name}
            className="max-h-[calc(100dvh-7rem)] max-w-full select-none rounded-lg border border-border bg-background object-contain"
            draggable={false}
          />
          <p className="mt-2 max-w-full truncate px-8 text-center text-muted-foreground text-xs">
            {item.name}
            {preview.images.length > 1 ? ` (${index + 1}/${preview.images.length})` : ""}
          </p>
        </div>
        {preview.images.length > 1 ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="absolute top-1/2 right-5 z-20 -translate-y-1/2 sm:right-6"
            aria-label="Next image"
            onClick={() => {
              navigateImage(1)
            }}
          >
            <ChevronRightIcon />
          </Button>
        ) : null}
      </DialogPopup>
    </Dialog>
  )
})
