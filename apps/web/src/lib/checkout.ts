import type { ThreadEnvMode } from "@noyau/protocol/entities/checkout"
import { threadBranchOf, threadWorktreePathOf } from "@noyau/protocol/entities/checkout"
import type { VcsRef, VcsStatusResult } from "@noyau/protocol/git"

export type CheckoutThread = {
  readonly branch?: string | null
  readonly worktreePath?: string | null
}

export const checkoutOf = (thread: CheckoutThread) => ({
  branch: threadBranchOf(thread),
  worktreePath: threadWorktreePathOf(thread),
})

/** `local` = WorkspaceRoot. Après bind, `worktreePath === null` signifie local. */
export const envModeOf = (thread: CheckoutThread): ThreadEnvMode =>
  threadWorktreePathOf(thread) === null ? "local" : "worktree"

export const resolveBranchSelectionTarget = (
  ref: Pick<VcsRef, "name" | "isRemote" | "worktreePath">,
  cwd: string,
): { readonly kind: "reuse"; readonly worktreePath: string } | { readonly kind: "switch" } => {
  if (ref.worktreePath !== null && ref.worktreePath !== cwd) {
    return { kind: "reuse", worktreePath: ref.worktreePath }
  }
  return { kind: "switch" }
}

export const resolveLocalCheckoutBranchMismatch = (input: {
  readonly envMode: ThreadEnvMode
  readonly threadBranch: string | null
  readonly liveBranch: string | null
  readonly worktreePath: string | null
}): { readonly previous: string; readonly current: string } | null => {
  if (input.envMode !== "local" || input.worktreePath !== null) {
    return null
  }
  if (input.threadBranch === null || input.liveBranch === null) {
    return null
  }
  if (input.threadBranch === input.liveBranch) {
    return null
  }
  return { previous: input.threadBranch, current: input.liveBranch }
}

export const statusLabel = (status: VcsStatusResult | undefined): string => {
  if (status === undefined) {
    return "Git"
  }
  if (!status.isRepo) {
    return "Pas un dépôt"
  }
  const branch = status.refName ?? "HEAD détaché"
  if (!status.hasWorkingTreeChanges) {
    return branch
  }
  return `${branch} · modifié`
}
