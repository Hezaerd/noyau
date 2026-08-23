import type { ThreadShell } from "@noyau/protocol/shell"
import { Fragment, type ReactNode } from "react"

import { sortThreadsForSidebar } from "@/lib/thread-sidebar-sort"

export function ThreadSidebarSection({
  threads,
  renderThread,
}: {
  readonly threads: ReadonlyArray<ThreadShell>
  readonly renderThread: (thread: ThreadShell) => ReactNode
}) {
  const renderedThreads = sortThreadsForSidebar(threads).map((thread) => (
    <Fragment key={thread.id}>{renderThread(thread)}</Fragment>
  ))

  return (
    <section aria-label="Threads" className="mt-1">
      <p className="px-2 text-[0.65rem] font-medium uppercase tracking-wide text-sidebar-foreground/45">
        Threads
      </p>
      <div className="mt-1 flex flex-col gap-0.5">{renderedThreads}</div>
    </section>
  )
}
