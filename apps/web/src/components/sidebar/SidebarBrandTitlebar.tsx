import { Blobatar } from "@blobatar/react"
import { useRef, type ReactElement } from "react"

import { useBrandGaze } from "@/hooks/use-brand-gaze"

function BrandBlobatar(): ReactElement {
  const hostRef = useRef<HTMLSpanElement>(null)
  useBrandGaze(hostRef)

  return (
    <span ref={hostRef} className="brand-blobatar no-drag inline-flex size-8 shrink-0">
      <Blobatar name="noyau" size={32} hue={246} animate="hover" className="size-8" />
    </span>
  )
}

export function SidebarBrandTitlebar(): ReactElement {
  return (
    <div
      className="drag-region flex h-(--desktop-titlebar-height) shrink-0 items-center gap-2 border-b border-sidebar-border/70 px-3"
      data-desktop-sidebar-titlebar=""
    >
      <BrandBlobatar />
      <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
        <p className="truncate text-sm font-semibold tracking-[-0.02em]">Noyau</p>
      </div>
    </div>
  )
}
