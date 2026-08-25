import type { VcsStatusPullRequest } from "@noyau/protocol/git"
import type { ThreadShell } from "@noyau/protocol/shell"
import { Fragment, type ReactNode } from "react"

import { useNowMinuteMs } from "@/hooks/use-now-minute"
import { useThreadPins } from "@/hooks/use-thread-pins"
import {
  useAutoSettleAfterDays,
  useAutoSettleOnMergeEnabled,
} from "@/hooks/use-thread-settle-preference"
import { partitionThreadsForSidebar } from "@/lib/thread-sidebar-sort"

export function ThreadSidebarSection({
  threads,
  pullRequests,
  renderThread,
}: {
  readonly threads: ReadonlyArray<ThreadShell>
  readonly pullRequests: ReadonlyMap<string, VcsStatusPullRequest>
  readonly renderThread: (thread: ThreadShell, settled: boolean) => ReactNode
}) {
  const pins = useThreadPins()
  const nowMs = useNowMinuteMs()
  const autoSettleAfterDays = useAutoSettleAfterDays()
  const autoSettleOnMerge = useAutoSettleOnMergeEnabled()
  const { active, settled } = partitionThreadsForSidebar(threads, {
    pins,
    nowMs,
    autoSettleAfterDays,
    autoSettleOnMerge,
    changeRequestStateOf: (thread) => pullRequests.get(thread.id)?.state ?? null,
  })

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
