import type { ThreadEnvMode } from "@noyau/protocol/entities/checkout"
import { threadBranchOf, threadWorktreePathOf } from "@noyau/protocol/entities/checkout"
import type { PrepareWorktree, VcsRef, VcsStatusResult } from "@noyau/protocol/git"
import type { ThreadId } from "@noyau/protocol/ids"

export type PendingCreatedCheckout = {
  readonly threadId: ThreadId
  readonly envMode: ThreadEnvMode
  readonly baseBranch: string | null
  readonly startFromOrigin: boolean
}

let pendingCreatedCheckout: PendingCreatedCheckout | undefined

/** Survit un remount draft → Thread créé, le temps que le snapshot arrive. */
export const rememberCreatedCheckout = (next: PendingCreatedCheckout): void => {
  pendingCreatedCheckout = next
}

export const peekCreatedCheckout = (threadId: ThreadId): PendingCreatedCheckout | undefined => {
  if (pendingCreatedCheckout?.threadId !== threadId) {
    return undefined
  }
  return pendingCreatedCheckout
}

export const clearCreatedCheckout = (threadId?: ThreadId): void => {
  if (threadId !== undefined && pendingCreatedCheckout?.threadId !== threadId) {
    return
  }
  pendingCreatedCheckout = undefined
}

export type CheckoutThread = {
  readonly branch?: string | null
  readonly worktreePath?: string | null
}

export const checkoutOf = (thread: CheckoutThread) => ({
  branch: threadBranchOf(thread),
  worktreePath: threadWorktreePathOf(thread),
})

/** Snapshot du Thread, sinon HEAD live du cwd (local = WorkspaceRoot). */
export const resolveSidebarCheckoutBranch = (input: {
  readonly threadBranch: string | null
  readonly liveBranch: string | null
}): string | null => input.threadBranch ?? input.liveBranch

/** Checkout déjà bindé : `worktreePath === null` signifie WorkspaceRoot. */
export const envModeOf = (thread: CheckoutThread): ThreadEnvMode =>
  threadWorktreePathOf(thread) === null ? "local" : "worktree"

/**
 * Mode affiché : le path bindé gagne, sinon l'intention de draft.
 * `worktreePath === null` ne force plus `local` — c'est l'état pending d'un nouveau worktree.
 */
export const resolveEffectiveEnvMode = (input: {
  readonly worktreePath: string | null
  readonly draftEnvMode: ThreadEnvMode
}): ThreadEnvMode => (input.worktreePath !== null ? "worktree" : input.draftEnvMode)

/** Lock une fois le path bindé, ou dès qu'un Turn a démarré (plus de bascule). */
export const envModeLockedOf = (input: {
  readonly worktreePath?: string | null
  readonly latestTurn?: { readonly turnId: string } | null | undefined
  readonly isRunning?: boolean
}): boolean => input.worktreePath != null || input.latestTurn != null || input.isRunning === true

export const resolveEnvModeLabel = (mode: ThreadEnvMode): string =>
  mode === "worktree" ? "Nouveau worktree" : "Checkout courant"

export const THREAD_ENV_MODE_ITEMS: ReadonlyArray<{
  readonly value: ThreadEnvMode
  readonly label: string
}> = [
  { value: "local", label: resolveEnvModeLabel("local") },
  { value: "worktree", label: resolveEnvModeLabel("worktree") },
]

/** Intention et `startFromOrigin` d'un draft, avant bind. */
export const draftCheckoutOf = (envMode: ThreadEnvMode) => ({
  envMode,
  startFromOrigin: envMode === "worktree",
})

export const resolveEnvModeTriggerLabel = (input: {
  readonly envMode: ThreadEnvMode
  readonly worktreePath: string | null
  readonly locked: boolean
}): string => {
  if (input.worktreePath !== null) {
    return "Worktree"
  }
  if (input.envMode === "worktree") {
    return "Nouveau worktree"
  }
  return input.locked ? "Checkout local" : "Checkout courant"
}

export const isSelectingWorktreeBase = (input: {
  readonly envMode: ThreadEnvMode
  readonly worktreePath: string | null
}): boolean => input.envMode === "worktree" && input.worktreePath === null

export const resolveWorktreeBaseBranch = (input: {
  readonly refs: ReadonlyArray<Pick<VcsRef, "name" | "isDefault" | "isRemote">>
  readonly currentBranch: string | null
}): string | null => {
  const localDefault = input.refs.find((ref) => ref.isDefault && !ref.isRemote)
  if (localDefault !== undefined) {
    return localDefault.name
  }
  const defaultRef = input.refs.find((ref) => ref.isDefault)
  if (defaultRef !== undefined) {
    return defaultRef.name.replace(/^origin\//, "")
  }
  return input.currentBranch
}

export const resolveBranchTriggerLabel = (input: {
  readonly envMode: ThreadEnvMode
  readonly worktreePath: string | null
  readonly baseBranch: string | null
  readonly liveBranch: string | null
  readonly startFromOrigin: boolean
  readonly status: VcsStatusResult | undefined
}): string => {
  if (isSelectingWorktreeBase(input)) {
    const base = input.baseBranch ?? input.liveBranch
    if (base === null || base === "") {
      return "Choisir une base"
    }
    const ref = input.startFromOrigin && !base.startsWith("origin/") ? `origin/${base}` : base
    return `Depuis ${ref}`
  }
  return statusLabel(input.status)
}

export const resolvePrepareWorktree = (input: {
  readonly envMode?: ThreadEnvMode
  readonly worktreePath?: string | null
  readonly baseBranch?: string | null
  readonly startFromOrigin?: boolean
}): PrepareWorktree | undefined => {
  if (input.envMode !== "worktree") {
    return undefined
  }
  if (input.worktreePath !== undefined && input.worktreePath !== null) {
    return undefined
  }
  const baseBranch = input.baseBranch?.trim()
  if (baseBranch === undefined || baseBranch === "") {
    return undefined
  }
  return input.startFromOrigin === false ? { baseBranch } : { baseBranch, startFromOrigin: true }
}

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

export const branchPickerBadge = (
  ref: Pick<VcsRef, "current" | "isDefault" | "isRemote" | "worktreePath">,
  cwd: string,
): "current" | "default" | "worktree" | "remote" | null => {
  if (ref.current) {
    return "current"
  }
  if (ref.worktreePath !== null && ref.worktreePath !== cwd) {
    return "worktree"
  }
  if (ref.isRemote) {
    return "remote"
  }
  if (ref.isDefault) {
    return "default"
  }
  return null
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
