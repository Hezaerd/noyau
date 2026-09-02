import { threadBranchOf, threadWorktreePathOf } from "@noyau/contracts/entities/checkout"
import type {
  VcsScope,
  VcsStatusPullRequest,
  VcsStatusResult,
  VcsStatusStreamEvent,
} from "@noyau/contracts/git"
import type { ProjectId, ThreadId } from "@noyau/contracts/ids"

export const applyVcsStatusStreamEvent = (
  _current: VcsStatusResult | null,
  event: VcsStatusStreamEvent,
): VcsStatusResult => event.status

export const vcsStatusScopeKey = (scope: VcsScope): string =>
  scope.threadId === undefined ? scope.projectId : `${scope.projectId}:${scope.threadId}`

export const uniqueVcsScopes = (
  projectId: ProjectId,
  threads: ReadonlyArray<{ readonly id: ThreadId; readonly worktreePath?: string | null }>,
): ReadonlyArray<VcsScope> => {
  const scopes: Array<VcsScope> = [{ projectId }]
  for (const thread of threads) {
    if (threadWorktreePathOf(thread) !== null) {
      scopes.push({ projectId, threadId: thread.id })
    }
  }
  return scopes
}

export const vcsScopeForThread = (
  projectId: ProjectId,
  thread: { readonly id: ThreadId; readonly worktreePath?: string | null },
): VcsScope =>
  threadWorktreePathOf(thread) === null ? { projectId } : { projectId, threadId: thread.id }

/** `null` = Thread sélectionné pas encore dans le shell : ne pas tomber sur WorkspaceRoot. */
export const resolveGitActionsScope = (
  projectId: ProjectId,
  input: {
    readonly threadId: ThreadId | undefined
    readonly thread: { readonly id: ThreadId; readonly worktreePath?: string | null } | undefined
  },
): VcsScope | null => {
  if (input.threadId === undefined) {
    return { projectId }
  }
  if (input.thread === undefined || input.thread.id !== input.threadId) {
    return null
  }
  return vcsScopeForThread(projectId, {
    id: input.threadId,
    worktreePath: input.thread.worktreePath ?? null,
  })
}

export const resolveThreadPr = (input: {
  readonly threadBranch: string | null
  readonly gitStatus: VcsStatusResult | null
}): VcsStatusPullRequest | null => {
  const { threadBranch, gitStatus } = input
  if (gitStatus === null || threadBranch === null || gitStatus.refName !== threadBranch) {
    return null
  }
  return gitStatus.pr
}

export interface ThreadChangeRequestSnapshot {
  readonly branch: string
  readonly pr: VcsStatusPullRequest
}

const isTerminalPrState = (state: VcsStatusPullRequest["state"]): boolean =>
  state === "merged" || state === "closed"

export const nextThreadChangeRequestSnapshot = (input: {
  readonly threadBranch: string | null
  readonly gitStatus: VcsStatusResult | null
  readonly snapshot: ThreadChangeRequestSnapshot | null | undefined
  readonly retainTerminalOnBranchMismatch: boolean
}): ThreadChangeRequestSnapshot | null | undefined => {
  const { threadBranch, gitStatus, snapshot, retainTerminalOnBranchMismatch } = input
  if (gitStatus === null) {
    return undefined
  }
  if (threadBranch === null) {
    return null
  }
  if (gitStatus.refName !== threadBranch) {
    return retainTerminalOnBranchMismatch &&
      snapshot != null &&
      isTerminalPrState(snapshot.pr.state)
      ? undefined
      : null
  }
  if (gitStatus.pr == null) {
    if (
      retainTerminalOnBranchMismatch &&
      snapshot != null &&
      isTerminalPrState(snapshot.pr.state)
    ) {
      return undefined
    }
    return null
  }
  return { branch: threadBranch, pr: gitStatus.pr }
}

export const resolveDisplayedThreadPr = (input: {
  readonly threadBranch: string | null
  readonly gitStatus: VcsStatusResult | null
  readonly snapshot: ThreadChangeRequestSnapshot | null | undefined
  readonly retainTerminalOnBranchMismatch: boolean
}): VcsStatusPullRequest | null => {
  const live = resolveThreadPr({
    threadBranch: input.threadBranch,
    gitStatus: input.gitStatus,
  })
  if (live !== null) {
    return live
  }
  if (
    input.retainTerminalOnBranchMismatch &&
    input.snapshot != null &&
    isTerminalPrState(input.snapshot.pr.state)
  ) {
    return input.snapshot.pr
  }
  return null
}

export const displayedThreadPr = (input: {
  readonly thread: { readonly branch?: string | null; readonly worktreePath?: string | null }
  readonly gitStatus: VcsStatusResult | null
  readonly snapshot: ThreadChangeRequestSnapshot | null | undefined
}): VcsStatusPullRequest | null =>
  resolveDisplayedThreadPr({
    threadBranch: threadBranchOf(input.thread),
    gitStatus: input.gitStatus,
    snapshot: input.snapshot,
    retainTerminalOnBranchMismatch: threadWorktreePathOf(input.thread) === null,
  })

export const pullRequestStateLabel = (state: VcsStatusPullRequest["state"]): string => {
  if (state === "open") {
    return "Open"
  }
  if (state === "merged") {
    return "Merged"
  }
  return "Closed"
}
