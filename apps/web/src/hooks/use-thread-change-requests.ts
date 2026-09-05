import type { VcsStatusPullRequest, VcsStatusResult } from "@noyau/contracts/git"
import type { ProjectId } from "@noyau/contracts/ids"
import type { ThreadShell } from "@noyau/contracts/shell"
import { useEffect, useMemo, useRef, useState } from "react"

import { subscribeVcsStatus } from "@/lib/control-plane"
import {
  createVcsStatusSubscriptionController,
  displayedThreadPr,
  nextThreadChangeRequestSnapshot,
  type ThreadChangeRequestSnapshot,
  type VcsStatusSubscribe,
  uniqueVcsStatusSubscriptionScopes,
  vcsScopeForThread,
  vcsStatusScopeKey,
} from "@/lib/vcs-status"
import { replaceProjectPullRequests } from "@/state/sidebar"

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
  subscribe: VcsStatusSubscribe = subscribeVcsStatus,
): {
  readonly pullRequests: ReadonlyMap<string, VcsStatusPullRequest>
  readonly liveBranches: ReadonlyMap<string, string>
} => {
  const scopes = useMemo(
    () => uniqueVcsStatusSubscriptionScopes(projectId, threads),
    [projectId, threads],
  )
  const [statuses, setStatuses] = useState<ReadonlyMap<string, VcsStatusResult>>(new Map())
  const [snapshots, setSnapshots] = useState<ReadonlyMap<string, ThreadChangeRequestSnapshot>>(
    new Map(),
  )
  const controllerRef = useRef<ReturnType<typeof createVcsStatusSubscriptionController>>(null)
  if (controllerRef.current === null) {
    controllerRef.current = createVcsStatusSubscriptionController(
      subscribe,
      (scope, event) => {
        const key = vcsStatusScopeKey(scope)
        setStatuses((current) => {
          const next = new Map(current)
          next.set(key, event.status)
          return next
        })
      },
      (key) => {
        setStatuses((current) => {
          if (!current.has(key)) {
            return current
          }
          const next = new Map(current)
          next.delete(key)
          return next
        })
      },
    )
  }
  const controller = controllerRef.current

  useEffect(() => {
    return () => controller.dispose()
  }, [controller])

  useEffect(() => {
    controller.reconcile(scopes, subscribe)
  }, [controller, scopes, subscribe])

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

  const derived = useMemo(() => {
    const pullRequests = new Map<string, VcsStatusPullRequest>()
    const liveBranches = new Map<string, string>()
    for (const thread of threads) {
      const status = statuses.get(vcsStatusScopeKey(vcsScopeForThread(projectId, thread))) ?? null
      const pr = displayedThreadPr({
        thread,
        gitStatus: status,
        snapshot: snapshots.get(thread.id),
      })
      if (pr !== null) {
        pullRequests.set(thread.id, pr)
      }
      if (status?.refName != null) {
        liveBranches.set(thread.id, status.refName)
      }
    }
    return { pullRequests, liveBranches }
  }, [projectId, snapshots, statuses, threads])

  useEffect(() => {
    replaceProjectPullRequests(projectId, derived.pullRequests)
  }, [projectId, derived.pullRequests])

  return derived
}
