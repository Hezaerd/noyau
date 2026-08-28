import type { ProjectId } from "@noyau/contracts/ids"
import type { ThreadShell } from "@noyau/contracts/shell"
import { ChevronDownIcon } from "lucide-react"
import { Fragment, type ReactNode } from "react"

import { useSidebarQueues } from "@/hooks/use-sidebar-queues"
import { useSettledShelfExpanded } from "@/hooks/use-thread-settle-preference"
import { settledShelfLabel, settledThreadsVisibleInShelf } from "@/lib/thread-sidebar-shelf"
import { cn } from "@/lib/utils"
import { setSettledShelfExpanded } from "@/state/thread-settle"

export function ThreadSidebarSection({
  projectId,
  draft = null,
  renderThread,
}: {
  readonly projectId: ProjectId
  readonly draft?: ReactNode
  readonly renderThread: (thread: ThreadShell, settled: boolean) => ReactNode
}) {
  const { active, settled } = useSidebarQueues(projectId)
  const settledShelfExpanded = useSettledShelfExpanded()
  const visibleSettled = settledThreadsVisibleInShelf(settled, settledShelfExpanded)
  const hasActive = draft != null || active.length > 0

  return (
    <section aria-label="Threads" className="mt-1">
      {hasActive ? (
        <>
          <p className="px-2 text-[0.65rem] font-medium uppercase tracking-wide text-sidebar-foreground/45">
            Threads
          </p>
          <div className="mt-1 flex flex-col gap-0.5">
            {draft}
            {active.map((thread) => (
              <Fragment key={thread.id}>{renderThread(thread, false)}</Fragment>
            ))}
          </div>
        </>
      ) : null}
      {settled.length > 0 ? (
        <div className={hasActive ? "mt-3" : undefined}>
          <button
            type="button"
            onClick={() => setSettledShelfExpanded(!settledShelfExpanded)}
            aria-expanded={settledShelfExpanded}
            aria-controls={visibleSettled.length > 0 ? "sidebar-settled-shelf" : undefined}
            data-testid="sidebar-settled-shelf-toggle"
            className="mb-1 flex w-full cursor-pointer items-center gap-2 px-2 text-left"
          >
            <span className="text-[0.65rem] font-medium uppercase tracking-wide text-sidebar-foreground/45">
              {settledShelfLabel(settled.length)}
            </span>
            <span aria-hidden className="h-px flex-1 bg-sidebar-border/60" />
            <ChevronDownIcon
              aria-hidden
              className={cn(
                "size-3 shrink-0 text-sidebar-foreground/45 transition-transform duration-150 motion-reduce:transition-none",
                settledShelfExpanded && "rotate-180",
              )}
            />
          </button>
          {visibleSettled.length > 0 ? (
            <div id="sidebar-settled-shelf" className="mt-1 flex flex-col gap-0.5">
              {visibleSettled.map((thread) => (
                <Fragment key={thread.id}>{renderThread(thread, true)}</Fragment>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
