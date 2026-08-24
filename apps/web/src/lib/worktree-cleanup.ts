import type { VcsRemoveWorktreeResult } from "@noyau/protocol/git"
import type { ProjectId, ThreadId } from "@noyau/protocol/ids"

import {
  buildCommand,
  dispatchCommand,
  type ControlPlaneResult,
  vcsRemoveWorktree,
} from "./control-plane"
import { makeThreadMetaUpdateRequest } from "./thread-commands"

export const shouldAutoRemoveMergedWorktree = (input: {
  readonly enabled: boolean
  readonly prState: string | null
  readonly worktreePath: string | null
  readonly isRunning: boolean
}): boolean =>
  input.enabled &&
  input.prState === "merged" &&
  input.worktreePath !== null &&
  input.worktreePath.length > 0 &&
  !input.isRunning

export const isThreadCheckoutBusy = (thread: {
  readonly latestTurn?: { readonly state: string } | null
  readonly sessionStatus?: string | null
}): boolean =>
  thread.latestTurn?.state === "running" ||
  thread.sessionStatus === "running" ||
  thread.sessionStatus === "starting"

export const releaseWorktree = async (input: {
  readonly projectId: ProjectId
  readonly path: string
  readonly unbindThreadIds?: ReadonlyArray<ThreadId>
}): Promise<ControlPlaneResult<VcsRemoveWorktreeResult>> => {
  const removed = await vcsRemoveWorktree({
    projectId: input.projectId,
    path: input.path,
    force: true,
  })
  if (!removed.ok) {
    return removed
  }
  const ids = new Set<ThreadId>([
    ...(input.unbindThreadIds ?? []),
    ...removed.value.releasedThreadIds,
  ])
  await Promise.all(
    [...ids].map(async (threadId) => {
      const built = await buildCommand(
        makeThreadMetaUpdateRequest({ threadId, worktreePath: null }),
      )
      if (!built.ok) {
        return
      }
      await dispatchCommand(built.value)
    }),
  )
  return removed
}
