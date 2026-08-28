import { useAtomValue } from "@effect/atom-react"
import type { ProjectId, ThreadId } from "@noyau/contracts/ids"
import type { ThreadShell } from "@noyau/contracts/shell"

import type { ThreadActivity } from "@/lib/thread-activity"
import type { SidebarThreadPartition } from "@/lib/thread-sidebar-sort"
import {
  emptySidebarQueuesAtom,
  sidebarQueuesAtom,
  threadActivityAtom,
  threadUnreadAtom,
} from "@/state/sidebar"

export const useSidebarQueues = (
  projectId: ProjectId | undefined,
): SidebarThreadPartition<ThreadShell> =>
  useAtomValue(projectId === undefined ? emptySidebarQueuesAtom : sidebarQueuesAtom(projectId))

export const useThreadActivity = (threadId: ThreadId): ThreadActivity | null =>
  useAtomValue(threadActivityAtom(threadId))

export const useThreadUnread = (threadId: ThreadId): boolean =>
  useAtomValue(threadUnreadAtom(threadId))
