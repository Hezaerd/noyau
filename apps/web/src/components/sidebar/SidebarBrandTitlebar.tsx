import { Blobatar } from "@blobatar/react"
import type { ReactElement } from "react"

import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover"
import { BRAND_BLOBATAR_NAME, brandBlobatarPalette } from "@/lib/brand-blobatar"
import { desktopChannelHint, desktopReleaseChannel } from "@/lib/desktop-bridge"
import { SIDEBAR_TITLEBAR_INSET_CLASS } from "@/lib/desktop-titlebar"
import { cn } from "@/lib/utils"

const BRAND_TITLE = "Noyau"
const brandTitleClassName = "truncate text-sm font-semibold tracking-[-0.02em]"

function BrandBlobatar(): ReactElement {
  const palette = brandBlobatarPalette(desktopReleaseChannel())

  return (
    <span className="brand-blobatar no-drag inline-flex size-8 shrink-0">
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

function BrandTitle(): ReactElement {
  const channelHint = desktopChannelHint()

  if (channelHint === undefined) {
    return <p className={brandTitleClassName}>{BRAND_TITLE}</p>
  }

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={200}
        className={cn(
          brandTitleClassName,
          "block w-full appearance-none border-0 bg-transparent p-0 text-left text-inherit cursor-default",
        )}
      >
        {BRAND_TITLE}
      </PopoverTrigger>
      <PopoverPopup side="top" tooltipStyle>
        {channelHint}
      </PopoverPopup>
    </Popover>
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
        <BrandTitle />
      </div>
    </div>
  )
}
