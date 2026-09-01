import type { VcsStatusPullRequest } from "@noyau/contracts/git"
import type { ProjectId, ThreadId } from "@noyau/contracts/ids"
import type { ThreadShell } from "@noyau/contracts/shell"
import { Atom } from "effect/unstable/reactivity"

import { resolveThreadActivity, type ThreadActivity } from "@/lib/thread-activity"
import { partitionThreadsForSidebar, type SidebarThreadPartition } from "@/lib/thread-sidebar-sort"
import { appAtomRegistry } from "@/state/atom-registry"
import { nowMinuteAtom } from "@/state/now"
import { projectThreadsAtom, threadShellAtom } from "@/state/shell"
import { threadPinsAtom } from "@/state/thread-pins"
import { autoSettleAfterDaysAtom } from "@/state/thread-settle"
import { visitAtom } from "@/state/thread-visits"

export const EMPTY_PULL_REQUESTS: ReadonlyMap<string, VcsStatusPullRequest> = new Map()

const sameThreadRefs = (
  left: ReadonlyArray<ThreadShell>,
  right: ReadonlyArray<ThreadShell>,
): boolean =>
  left.length === right.length && left.every((thread, index) => Object.is(thread, right[index]))

export const projectPullRequestsAtom = Atom.family((projectId: ProjectId) =>
  Atom.make(EMPTY_PULL_REQUESTS).pipe(
    Atom.keepAlive,
    Atom.withLabel(`chrome:pull-requests:${projectId}`),
  ),
)

export const replaceProjectPullRequests = (
  projectId: ProjectId,
  pullRequests: ReadonlyMap<string, VcsStatusPullRequest>,
): void => {
  if (Object.is(appAtomRegistry.get(projectPullRequestsAtom(projectId)), pullRequests)) {
    return
  }
  appAtomRegistry.set(projectPullRequestsAtom(projectId), pullRequests)
}

export const emptyPullRequestsAtom = Atom.make(EMPTY_PULL_REQUESTS).pipe(
  Atom.withLabel("chrome:pull-requests:empty"),
)

export const emptySidebarQueuesAtom = Atom.make<SidebarThreadPartition<ThreadShell>>({
  pinned: [],
  active: [],
  settled: [],
}).pipe(Atom.withLabel("chrome:sidebar-queues:empty"))

export const sidebarQueuesAtom = Atom.family((projectId: ProjectId) =>
  Atom.make((get): SidebarThreadPartition<ThreadShell> => {
    const threads = get(projectThreadsAtom(projectId)).filter(
      (thread) => thread.status === "active",
    )
    const pins = get(threadPinsAtom)
    const pullRequests = get(projectPullRequestsAtom(projectId))
    return partitionThreadsForSidebar(threads, {
      pins,
      nowMs: get(nowMinuteAtom),
      autoSettleAfterDays: get(autoSettleAfterDaysAtom),
      changeRequestStateOf: (thread) => pullRequests.get(thread.id)?.state ?? null,
    })
  }).pipe(
    Atom.withEquality<SidebarThreadPartition<ThreadShell>>(
      (left, right) =>
        sameThreadRefs(left.pinned, right.pinned) &&
        sameThreadRefs(left.active, right.active) &&
        sameThreadRefs(left.settled, right.settled),
    ),
    Atom.withLabel(`chrome:sidebar-queues:${projectId}`),
  ),
)

export const threadActivityAtom = Atom.family((threadId: ThreadId) =>
  Atom.make((get): ThreadActivity | null => {
    const thread = get(threadShellAtom(threadId))
    if (thread === undefined) {
      return null
    }
    return resolveThreadActivity({
      sessionStatus: thread.sessionStatus,
      latestTurn: thread.latestTurn,
      lastVisitedAtMs: get(visitAtom(threadId)),
    })
  }).pipe(Atom.withLabel(`chrome:thread-activity:${threadId}`)),
)

export const threadUnreadAtom = Atom.family((threadId: ThreadId) =>
  Atom.make((get): boolean => {
    const activity = get(threadActivityAtom(threadId))
    return activity?.kind === "completed" || activity?.kind === "interrupted"
  }).pipe(Atom.withLabel(`chrome:thread-unread:${threadId}`)),
)
