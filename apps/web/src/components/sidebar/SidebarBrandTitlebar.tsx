import { Blobatar } from "@blobatar/react"
import { useRef, type ReactElement } from "react"

import { useAppearance } from "@/hooks/use-appearance"
import { useBrandGaze } from "@/hooks/use-brand-gaze"
import { useMediaQuery } from "@/hooks/use-media-query"
import { resolveAppearance } from "@/lib/appearance"
import { BRAND_BLOBATAR_NAME, brandBlobatarPalette } from "@/lib/brand-blobatar"
import { SIDEBAR_TITLEBAR_INSET_CLASS } from "@/lib/desktop-titlebar"
import { cn } from "@/lib/utils"

function BrandBlobatar(): ReactElement {
  const hostRef = useRef<HTMLSpanElement>(null)
  const { preference } = useAppearance()
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)")
  const palette = brandBlobatarPalette(resolveAppearance(preference, systemDark))
  useBrandGaze(hostRef)

  return (
    <span ref={hostRef} className="brand-blobatar no-drag inline-flex size-8 shrink-0">
      <Blobatar
        name={BRAND_BLOBATAR_NAME}
        size={32}
        palette={palette}
        animate="hover"
        className="size-8"
      />
    </span>
  )
}

export function SidebarBrandTitlebar(): ReactElement {
  return (
    <div
      className={cn(
        "drag-region flex h-(--desktop-titlebar-height) shrink-0 items-center gap-2 border-b border-sidebar-border/70 pr-3",
        SIDEBAR_TITLEBAR_INSET_CLASS,
      )}
      data-desktop-sidebar-titlebar=""
    >
      <BrandBlobatar />
      <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
        <p className="truncate text-sm font-semibold tracking-[-0.02em]">Noyau</p>
      </div>
    </div>
  )
}
