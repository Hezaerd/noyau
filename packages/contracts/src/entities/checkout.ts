import { Schema } from "effect"

/** Intention de draft : où le prochain Turn travaille. Pas un fait du Thread. */
export const ThreadEnvMode = Schema.Literals(["local", "worktree"])
export type ThreadEnvMode = (typeof ThreadEnvMode)["Type"]

/** Branche visée au dernier bind Noyau. HEAD live = `vcs.status`. */
export const ThreadBranch = Schema.NullOr(Schema.NonEmptyString)
export type ThreadBranch = (typeof ThreadBranch)["Type"]

/** Cwd lié du Thread. `null` = `WorkspaceRoot` du Project. */
export const ThreadWorktreePath = Schema.NullOr(Schema.NonEmptyString)
export type ThreadWorktreePath = (typeof ThreadWorktreePath)["Type"]

export const threadBranchOf = (thread: { readonly branch?: string | null }): string | null =>
  thread.branch ?? null

export const threadWorktreePathOf = (thread: {
  readonly worktreePath?: string | null
}): string | null => thread.worktreePath ?? null
