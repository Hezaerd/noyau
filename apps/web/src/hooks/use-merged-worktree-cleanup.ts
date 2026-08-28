import { threadWorktreePathOf } from "@noyau/contracts/entities/checkout"
import type { VcsStatusPullRequest } from "@noyau/contracts/git"
import type { ProjectId } from "@noyau/contracts/ids"
import type { ThreadShell } from "@noyau/contracts/shell"
import { useEffect, useRef } from "react"

import { useAutoRemoveMergedWorktreeEnabled } from "@/hooks/use-auto-remove-merged-worktree"
import {
  isThreadCheckoutBusy,
  releaseWorktree,
  shouldAutoRemoveMergedWorktree,
} from "@/lib/worktree-cleanup"

export const useMergedWorktreeCleanup = (
  projectId: ProjectId,
  threads: ReadonlyArray<ThreadShell>,
  pullRequests: ReadonlyMap<string, VcsStatusPullRequest>,
): void => {
  const enabled = useAutoRemoveMergedWorktreeEnabled()
  const inFlight = useRef(new Set<string>())

  useEffect(() => {
    if (!enabled) {
      return
    }
    for (const thread of threads) {
      const path = threadWorktreePathOf(thread)
      if (
        !shouldAutoRemoveMergedWorktree({
          enabled,
          prState: pullRequests.get(thread.id)?.state ?? null,
          worktreePath: path,
          isRunning: isThreadCheckoutBusy(thread),
        })
      ) {
        continue
      }
      if (path === null || inFlight.current.has(path)) {
        continue
      }
      inFlight.current.add(path)
      void releaseWorktree({
        projectId,
        path,
        unbindThreadIds: [thread.id],
      }).finally(() => {
        inFlight.current.delete(path)
      })
    }
  }, [enabled, projectId, pullRequests, threads])
}
