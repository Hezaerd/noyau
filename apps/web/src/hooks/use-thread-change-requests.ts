import type { VcsStatusPullRequest, VcsStatusResult } from "@noyau/protocol/git"
import type { ProjectId } from "@noyau/protocol/ids"
import type { ThreadShell } from "@noyau/protocol/shell"
import { useEffect, useMemo, useState } from "react"

import { subscribeVcsStatus } from "@/lib/control-plane"
import {
  displayedThreadPr,
  nextThreadChangeRequestSnapshot,
  type ThreadChangeRequestSnapshot,
  uniqueVcsScopes,
  vcsScopeForThread,
  vcsStatusScopeKey,
} from "@/lib/vcs-status"

const sameSnapshot = (
  left: ThreadChangeRequestSnapshot | undefined,
  right: ThreadChangeRequestSnapshot,
): boolean =>
  left !== undefined &&
  left.branch === right.branch &&
  left.pr.number === right.pr.number &&
  left.pr.state === right.pr.state &&
  left.pr.url === right.pr.url &&
  left.pr.title === right.pr.title

export const useThreadChangeRequests = (
  projectId: ProjectId,
  threads: ReadonlyArray<ThreadShell>,
): ReadonlyMap<string, VcsStatusPullRequest> => {
  const scopes = useMemo(() => uniqueVcsScopes(projectId, threads), [projectId, threads])
  const [statuses, setStatuses] = useState<ReadonlyMap<string, VcsStatusResult>>(new Map())
  const [snapshots, setSnapshots] = useState<ReadonlyMap<string, ThreadChangeRequestSnapshot>>(
    new Map(),
  )

  useEffect(() => {
    const stops = scopes.map((scope) => {
      const key = vcsStatusScopeKey(scope)
      return subscribeVcsStatus(scope, (event) => {
        setStatuses((current) => {
          const next = new Map(current)
          next.set(key, event.status)
          return next
        })
      })
    })
    return () => {
      for (const stop of stops) {
        stop()
      }
    }
  }, [projectId, scopes])

  useEffect(() => {
    setSnapshots((current) => {
      const next = new Map(current)
      let changed = false
      for (const thread of threads) {
        const status = statuses.get(vcsStatusScopeKey(vcsScopeForThread(projectId, thread))) ?? null
        const nextSnapshot = nextThreadChangeRequestSnapshot({
          threadBranch: thread.branch ?? null,
          gitStatus: status,
          snapshot: current.get(thread.id),
          retainTerminalOnBranchMismatch: thread.worktreePath == null,
        })
        if (nextSnapshot === null) {
          if (next.delete(thread.id)) {
            changed = true
          }
        } else if (nextSnapshot !== undefined && !sameSnapshot(next.get(thread.id), nextSnapshot)) {
          next.set(thread.id, nextSnapshot)
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [projectId, statuses, threads])

  return useMemo(() => {
    const displayed = new Map<string, VcsStatusPullRequest>()
    for (const thread of threads) {
      const status = statuses.get(vcsStatusScopeKey(vcsScopeForThread(projectId, thread))) ?? null
      const pr = displayedThreadPr({
        thread,
        gitStatus: status,
        snapshot: snapshots.get(thread.id),
      })
      if (pr !== null) {
        displayed.set(thread.id, pr)
      }
    }
    return displayed
  }, [projectId, snapshots, statuses, threads])
}
