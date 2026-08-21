import type { ComponentProps } from "react"
import type { ExtraProps } from "streamdown"

import { cn } from "@/lib/utils"

export function ThreadMarkdownTable({
  children,
  className,
  node: _node,
  ...props
}: ComponentProps<"table"> & ExtraProps) {
  return (
    <div className="thread-markdown-table my-2.5 max-w-full overflow-x-auto rounded-[var(--radius)] border">
      <table
        className={cn(
          "w-full border-collapse text-left [&_td]:p-2.5 [&_td:not(:last-child)]:border-r [&_th]:bg-muted/40 [&_th]:p-2.5 [&_th]:font-semibold [&_th:not(:last-child)]:border-r [&_tr:not(:last-child)]:border-b",
          className,
        )}
        data-streamdown="table"
        {...props}
      >
        {children}
      </table>
    </div>
  )
}
