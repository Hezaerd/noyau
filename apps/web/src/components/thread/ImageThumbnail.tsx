import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export const IMAGE_THUMBNAIL_CLASS_NAME =
  "relative inline-flex size-14 shrink-0 overflow-hidden rounded-lg border bg-muted align-middle [&_img]:size-full [&_img]:max-h-full [&_img]:max-w-full [&_img]:object-cover"

export function ImageThumbnail({
  src,
  alt,
  className,
  children,
  onExpand,
}: {
  readonly src?: string | undefined
  readonly alt: string
  readonly className?: string | undefined
  readonly children?: ReactNode
  readonly onExpand?: (() => void) | undefined
}) {
  const canExpand = onExpand !== undefined && src !== undefined
  return (
    <span data-image-thumbnail="" className={cn(IMAGE_THUMBNAIL_CLASS_NAME, className)}>
      {src === undefined ? (
        <span className="flex size-full items-center justify-center px-1 text-center text-[10px] text-muted-foreground">
          {alt}
        </span>
      ) : canExpand ? (
        <button
          type="button"
          className="size-full cursor-zoom-in"
          aria-label={`Agrandir ${alt}`}
          onClick={onExpand}
        >
          <img alt="" src={src} className="size-full object-cover" />
        </button>
      ) : (
        <img alt={alt} src={src} className="size-full object-cover" />
      )}
      {children}
    </span>
  )
}
