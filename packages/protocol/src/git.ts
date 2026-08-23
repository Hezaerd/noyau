import { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { Schema } from "effect"

const TrimmedNonEmpty = Schema.NonEmptyString

export class GitCommandError extends Schema.TaggedError<GitCommandError>()("GitCommandError", {
  operation: Schema.NonEmptyString,
  detail: Schema.NonEmptyString,
}) {}

/** Portée d'une opération VCS. `threadId` absent = `WorkspaceRoot` du Project. */
export const VcsScope = Schema.Struct({
  projectId: ProjectId,
  threadId: Schema.optionalKey(ThreadId),
})
export type VcsScope = (typeof VcsScope)["Type"]

export const VcsRef = Schema.Struct({
  name: TrimmedNonEmpty,
  isRemote: Schema.Boolean,
  current: Schema.Boolean,
  isDefault: Schema.Boolean,
  worktreePath: Schema.NullOr(TrimmedNonEmpty),
})
export type VcsRef = (typeof VcsRef)["Type"]

export const VcsWorktree = Schema.Struct({
  path: TrimmedNonEmpty,
  refName: TrimmedNonEmpty,
})
export type VcsWorktree = (typeof VcsWorktree)["Type"]

export const VcsStatusPullRequestState = Schema.Literals(["open", "closed", "merged"])
export type VcsStatusPullRequestState = (typeof VcsStatusPullRequestState)["Type"]

/** PR GitHub live du HEAD courant. Hors journal : join cwd/branche via `gh`. */
export const VcsStatusPullRequest = Schema.Struct({
  number: Schema.Int.check(Schema.isGreaterThan(0)),
  title: TrimmedNonEmpty,
  url: Schema.NonEmptyString,
  baseRef: TrimmedNonEmpty,
  headRef: TrimmedNonEmpty,
  state: VcsStatusPullRequestState,
})
export type VcsStatusPullRequest = (typeof VcsStatusPullRequest)["Type"]

export const VcsStatusResult = Schema.Struct({
  isRepo: Schema.Boolean,
  cwd: TrimmedNonEmpty,
  refName: Schema.NullOr(TrimmedNonEmpty),
  isDefaultRef: Schema.Boolean,
  hasPrimaryRemote: Schema.Boolean,
  hasWorkingTreeChanges: Schema.Boolean,
  hasUpstream: Schema.Boolean,
  aheadCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  behindCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  worktreePath: Schema.NullOr(TrimmedNonEmpty),
  pr: Schema.NullOr(VcsStatusPullRequest),
})
export type VcsStatusResult = (typeof VcsStatusResult)["Type"]

export const VcsStatusStreamEvent = Schema.Union([
  Schema.TaggedStruct("snapshot", {
    status: VcsStatusResult,
  }),
  Schema.TaggedStruct("updated", {
    status: VcsStatusResult,
  }),
])
export type VcsStatusStreamEvent = (typeof VcsStatusStreamEvent)["Type"]

export const VcsListRefsResult = Schema.Struct({
  isRepo: Schema.Boolean,
  refs: Schema.Array(VcsRef),
})
export type VcsListRefsResult = (typeof VcsListRefsResult)["Type"]

export const VcsSwitchRefInput = Schema.Struct({
  ...VcsScope.fields,
  refName: TrimmedNonEmpty,
})
export type VcsSwitchRefInput = (typeof VcsSwitchRefInput)["Type"]

export const VcsSwitchRefResult = Schema.Struct({
  refName: Schema.NullOr(TrimmedNonEmpty),
  worktreePath: Schema.NullOr(TrimmedNonEmpty),
  reusedWorktree: Schema.Boolean,
})
export type VcsSwitchRefResult = (typeof VcsSwitchRefResult)["Type"]

export const VcsCreateRefInput = Schema.Struct({
  ...VcsScope.fields,
  refName: TrimmedNonEmpty,
  switchRef: Schema.optionalKey(Schema.Boolean),
})
export type VcsCreateRefInput = (typeof VcsCreateRefInput)["Type"]

export const VcsCreateRefResult = Schema.Struct({
  refName: TrimmedNonEmpty,
})
export type VcsCreateRefResult = (typeof VcsCreateRefResult)["Type"]

export const VcsCreateWorktreeInput = Schema.Struct({
  ...VcsScope.fields,
  baseBranch: TrimmedNonEmpty,
  branch: Schema.optionalKey(TrimmedNonEmpty),
  startFromOrigin: Schema.optionalKey(Schema.Boolean),
})
export type VcsCreateWorktreeInput = (typeof VcsCreateWorktreeInput)["Type"]

export const VcsCreateWorktreeResult = Schema.Struct({
  worktree: VcsWorktree,
})
export type VcsCreateWorktreeResult = (typeof VcsCreateWorktreeResult)["Type"]

export const GitStackedAction = Schema.Literals([
  "commit",
  "push",
  "create_pr",
  "commit_push",
  "commit_push_pr",
])
export type GitStackedAction = (typeof GitStackedAction)["Type"]

export const GitDraftKind = Schema.Literals(["commit", "pr"])
export type GitDraftKind = (typeof GitDraftKind)["Type"]

export const GitDraftInput = Schema.Struct({
  ...VcsScope.fields,
  kind: GitDraftKind,
})
export type GitDraftInput = (typeof GitDraftInput)["Type"]

export const GitDraftResult = Schema.Struct({
  title: TrimmedNonEmpty,
  body: Schema.optionalKey(Schema.String),
})
export type GitDraftResult = (typeof GitDraftResult)["Type"]

export const GitRunStackedActionInput = Schema.Struct({
  ...VcsScope.fields,
  action: GitStackedAction,
  actionId: TrimmedNonEmpty,
  commitMessage: Schema.optionalKey(TrimmedNonEmpty),
  pullRequestTitle: Schema.optionalKey(TrimmedNonEmpty),
  pullRequestBody: Schema.optionalKey(Schema.String),
})
export type GitRunStackedActionInput = (typeof GitRunStackedActionInput)["Type"]

export const GitCommitStepStatus = Schema.Literals([
  "created",
  "skipped_no_changes",
  "skipped_not_requested",
])
export const GitPushStepStatus = Schema.Literals([
  "pushed",
  "skipped_not_requested",
  "skipped_up_to_date",
])
export const GitPrStepStatus = Schema.Literals([
  "created",
  "opened_existing",
  "skipped_not_requested",
])

export const GitRunStackedActionResult = Schema.Struct({
  action: GitStackedAction,
  branch: Schema.NullOr(TrimmedNonEmpty),
  commit: Schema.Struct({
    status: GitCommitStepStatus,
    commitSha: Schema.optionalKey(TrimmedNonEmpty),
    subject: Schema.optionalKey(TrimmedNonEmpty),
  }),
  push: Schema.Struct({
    status: GitPushStepStatus,
  }),
  pullRequest: Schema.Struct({
    status: GitPrStepStatus,
    url: Schema.optionalKey(Schema.String),
    number: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
  }),
})
export type GitRunStackedActionResult = (typeof GitRunStackedActionResult)["Type"]

export const PrepareWorktree = Schema.Struct({
  baseBranch: TrimmedNonEmpty,
  branch: Schema.optionalKey(TrimmedNonEmpty),
  startFromOrigin: Schema.optionalKey(Schema.Boolean),
})
export type PrepareWorktree = (typeof PrepareWorktree)["Type"]

export const GitRepositoryVisibility = Schema.Literals(["private", "public"])
export type GitRepositoryVisibility = (typeof GitRepositoryVisibility)["Type"]

export const GitPublishStatus = Schema.Literals(["pushed", "remote_added"])
export type GitPublishStatus = (typeof GitPublishStatus)["Type"]

export const GitHubAccountResult = Schema.Struct({
  login: Schema.NullOr(TrimmedNonEmpty),
})
export type GitHubAccountResult = (typeof GitHubAccountResult)["Type"]

export const GitPublishRepositoryInput = Schema.Struct({
  ...VcsScope.fields,
  repository: TrimmedNonEmpty,
  visibility: GitRepositoryVisibility,
})
export type GitPublishRepositoryInput = (typeof GitPublishRepositoryInput)["Type"]

export const GitPublishRepositoryResult = Schema.Struct({
  nameWithOwner: TrimmedNonEmpty,
  url: Schema.NonEmptyString,
  remoteName: TrimmedNonEmpty,
  branch: Schema.NullOr(TrimmedNonEmpty),
  status: GitPublishStatus,
})
export type GitPublishRepositoryResult = (typeof GitPublishRepositoryResult)["Type"]
