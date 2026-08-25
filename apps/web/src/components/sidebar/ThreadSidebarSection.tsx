import type { ProjectId } from "@noyau/protocol/ids"
import type { ThreadShell } from "@noyau/protocol/shell"
import { Fragment, type ReactNode } from "react"

import { useSidebarQueues } from "@/hooks/use-sidebar-queues"

export function ThreadSidebarSection({
  projectId,
  renderThread,
}: {
  readonly projectId: ProjectId
  readonly renderThread: (thread: ThreadShell, settled: boolean) => ReactNode
}) {
  const { active, settled } = useSidebarQueues(projectId)

  return (
    <section aria-label="Threads" className="mt-1">
      {active.length > 0 ? (
        <>
          <p className="px-2 text-[0.65rem] font-medium uppercase tracking-wide text-sidebar-foreground/45">
            Threads
          </p>
          <div className="mt-1 flex flex-col gap-0.5">
            {active.map((thread) => (
              <Fragment key={thread.id}>{renderThread(thread, false)}</Fragment>
            ))}
          </div>
        </>
      ) : null}
      {settled.length > 0 ? (
        <div className={active.length > 0 ? "mt-3" : undefined}>
          <p className="px-2 text-[0.65rem] font-medium uppercase tracking-wide text-sidebar-foreground/45">
            Classés
          </p>
          <div className="mt-1 flex flex-col gap-0.5">
            {settled.map((thread) => (
              <Fragment key={thread.id}>{renderThread(thread, true)}</Fragment>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
