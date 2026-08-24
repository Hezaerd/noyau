import { threadWorktreePathOf } from "@noyau/protocol/entities/checkout"
import type { VcsStatusPullRequest } from "@noyau/protocol/git"
import type { ProjectId } from "@noyau/protocol/ids"
import type { ThreadShell } from "@noyau/protocol/shell"
import { useEffect, useRef } from "react"

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
  const inFlight = useRef(new Set<string>())

  useEffect(() => {
    for (const thread of threads) {
      const path = threadWorktreePathOf(thread)
      if (
        !shouldAutoRemoveMergedWorktree({
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
  }, [projectId, pullRequests, threads])
}
