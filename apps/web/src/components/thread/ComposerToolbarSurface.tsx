import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

/** Shared visual shell for toolbars attached above the composer. */
export function ComposerToolbarSurface({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="composer-toolbar-surface"
      className={cn(
        "surface-glass absolute inset-x-6 bottom-full z-20 translate-y-px overflow-hidden rounded-t-xl border border-b-0 shadow-[0_-12px_28px_-18px_rgb(0_0_0/40%)] dark:shadow-none",
        className,
      )}
      {...props}
    />
  )
}
