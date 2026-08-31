import type { VcsStatusPullRequest } from "@noyau/contracts/git"
import type { ProjectId, ThreadId } from "@noyau/contracts/ids"
import type { ThreadShell } from "@noyau/contracts/shell"

import { useAppAtomValue } from "@/hooks/use-app-atom"
import type { ThreadActivity } from "@/lib/thread-activity"
import type { SidebarThreadPartition } from "@/lib/thread-sidebar-sort"
import {
  emptyPullRequestsAtom,
  emptySidebarQueuesAtom,
  projectPullRequestsAtom,
  sidebarQueuesAtom,
  threadActivityAtom,
  threadUnreadAtom,
} from "@/state/sidebar"

export const useSidebarQueues = (
  projectId: ProjectId | undefined,
): SidebarThreadPartition<ThreadShell> =>
  useAppAtomValue(projectId === undefined ? emptySidebarQueuesAtom : sidebarQueuesAtom(projectId))

export const useProjectPullRequests = (
  projectId: ProjectId | undefined,
): ReadonlyMap<string, VcsStatusPullRequest> =>
  useAppAtomValue(
    projectId === undefined ? emptyPullRequestsAtom : projectPullRequestsAtom(projectId),
  )

export const useThreadActivity = (threadId: ThreadId): ThreadActivity | null =>
  useAppAtomValue(threadActivityAtom(threadId))

export const useThreadUnread = (threadId: ThreadId): boolean =>
  useAppAtomValue(threadUnreadAtom(threadId))
