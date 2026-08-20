import type { ThreadShell } from "@noyau/protocol/shell"
import { Children, type ReactNode } from "react"

export function ThreadSidebarSection({
  threads,
  renderThread,
}: {
  readonly threads: ReadonlyArray<Pick<ThreadShell, "id" | "title">>
  readonly renderThread: (thread: Pick<ThreadShell, "id" | "title">) => ReactNode
}) {
  const renderedThreads = Children.toArray(threads.map(renderThread))

  return (
    <section aria-label="Threads" className="mt-1">
      <p className="px-2 text-[0.65rem] font-medium uppercase tracking-wide text-sidebar-foreground/45">
        Threads
      </p>
      <div className="mt-1 flex flex-col gap-0.5">{renderedThreads}</div>
    </section>
  )
}
