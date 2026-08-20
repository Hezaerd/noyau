import type { ReactElement } from "react"

export function SidebarBrandTitlebar(): ReactElement {
  return (
    <div
      className="drag-region flex h-(--desktop-titlebar-height) shrink-0 items-center gap-2 border-b border-sidebar-border/70 px-3"
      data-desktop-sidebar-titlebar=""
    >
      <div aria-hidden className="size-8 shrink-0 rounded-xl bg-sidebar-primary shadow-lg/5" />
      <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
        <p className="truncate text-sm font-semibold tracking-[-0.02em]">Noyau</p>
      </div>
    </div>
  )
}
