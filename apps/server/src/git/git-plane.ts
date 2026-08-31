import type { ServiceUnavailable } from "@noyau/contracts/errors"
import {
  GitCommandError,
  type GitDraftInput,
  type GitDraftResult,
  type GitGetPullRequestInput,
  type GitHubAccountResult,
  type GitPublishRepositoryInput,
  type GitPullRequest,
  type GitPublishRepositoryResult,
  type GitRunStackedActionInput,
  type GitRunStackedActionResult,
  type VcsCreateRefInput,
  type VcsCreateRefResult,
  type VcsCreateWorktreeInput,
  type VcsCreateWorktreeResult,
  type VcsListRefsResult,
  type VcsScope,
  type VcsStatusResult,
  type VcsStatusStreamEvent,
  type VcsSwitchRefInput,
  type VcsSwitchRefResult,
} from "@noyau/contracts/git"
import { ServerConfig } from "@noyau/server/config"
import { TextGeneration } from "@noyau/server/text-generation/text-generation"
import { resolveWorkspaceCwd } from "@noyau/server/workspace-cwd"
import { Context, Crypto, Effect, Layer, Stream } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

import { buildTemporaryWorktreeBranchName, GitRuntime, gitRuntimeLayer } from "./git-runtime.ts"
import { VcsStatusBroadcaster, vcsStatusBroadcasterLayer } from "./vcs-status-broadcaster.ts"

export interface GitPlaneService {
  readonly status: (
    scope: VcsScope,
  ) => Effect.Effect<VcsStatusResult, GitCommandError | ServiceUnavailable>
  readonly subscribeStatus: (
    scope: VcsScope,
  ) => Stream.Stream<VcsStatusStreamEvent, GitCommandError | ServiceUnavailable>
  readonly listRefs: (
    scope: VcsScope,
  ) => Effect.Effect<VcsListRefsResult, GitCommandError | ServiceUnavailable>
  readonly switchRef: (
    input: VcsSwitchRefInput,
  ) => Effect.Effect<VcsSwitchRefResult, GitCommandError | ServiceUnavailable>
  readonly createRef: (
    input: VcsCreateRefInput,
  ) => Effect.Effect<VcsCreateRefResult, GitCommandError | ServiceUnavailable>
  readonly createWorktree: (
    input: VcsCreateWorktreeInput,
  ) => Effect.Effect<VcsCreateWorktreeResult, GitCommandError | ServiceUnavailable>
  readonly draft: (
    input: GitDraftInput,
  ) => Effect.Effect<GitDraftResult, GitCommandError | ServiceUnavailable>
  readonly runStackedAction: (
    input: GitRunStackedActionInput,
  ) => Effect.Effect<GitRunStackedActionResult, GitCommandError | ServiceUnavailable>
  readonly githubAccount: (
    scope: VcsScope,
  ) => Effect.Effect<GitHubAccountResult, ServiceUnavailable>
  readonly getPullRequest: (
    input: GitGetPullRequestInput,
  ) => Effect.Effect<GitPullRequest, GitCommandError | ServiceUnavailable>
  readonly publishRepository: (
    input: GitPublishRepositoryInput,
  ) => Effect.Effect<GitPublishRepositoryResult, GitCommandError | ServiceUnavailable>
}

export class GitPlane extends Context.Service<GitPlane, GitPlaneService>()(
  "@noyau/server/git/GitPlane",
) {}

const makeGitPlane = Effect.fn("GitPlane.make")(function* () {
  const git = yield* GitRuntime
  const broadcaster = yield* VcsStatusBroadcaster
  const textGeneration = yield* TextGeneration
  const config = yield* ServerConfig
  const crypto = yield* Crypto.Crypto
  const sql = yield* SqlClient
  const scoped = <A, E>(effect: Effect.Effect<A, E, SqlClient>) =>
    effect.pipe(Effect.provideService(SqlClient, sql))
  const refreshAfter = <A, E>(cwd: string, effect: Effect.Effect<A, E>) =>
    effect.pipe(Effect.tap(() => broadcaster.refresh(cwd).pipe(Effect.ignore)))

  return GitPlane.of({
    status: (scope) =>
      scoped(resolveWorkspaceCwd(scope).pipe(Effect.flatMap(({ cwd }) => git.status(cwd)))),
    subscribeStatus: (scope) =>
      Stream.unwrap(
        scoped(resolveWorkspaceCwd(scope)).pipe(
          Effect.map(({ cwd }) => broadcaster.streamStatus(cwd)),
        ),
      ),
    listRefs: (scope) =>
      scoped(
        resolveWorkspaceCwd(scope).pipe(
          Effect.flatMap(({ cwd }) =>
            git
              .status(cwd, { includePr: false })
              .pipe(
                Effect.flatMap((status) =>
                  git
                    .listRefs(cwd)
                    .pipe(
                      Effect.map(
                        (refs) => ({ isRepo: status.isRepo, refs }) satisfies VcsListRefsResult,
                      ),
                    ),
                ),
              ),
          ),
        ),
      ),
    switchRef: (input) =>
      scoped(
        resolveWorkspaceCwd(input).pipe(
          Effect.flatMap(({ cwd }) => refreshAfter(cwd, git.switchRef(cwd, input.refName))),
        ),
      ),
    createRef: (input) =>
      scoped(
        resolveWorkspaceCwd(input).pipe(
          Effect.flatMap(({ cwd }) =>
            refreshAfter(cwd, git.createRef(cwd, input.refName, input.switchRef === true)),
          ),
        ),
      ),
    createWorktree: (input) =>
      scoped(
        Effect.gen(function* () {
          const { cwd, workspaceRoot } = yield* resolveWorkspaceCwd(input)
          const branch =
            input.branch ??
            buildTemporaryWorktreeBranchName(yield* crypto.randomUUIDv4.pipe(Effect.orDie))
          return yield* refreshAfter(
            cwd,
            git.createWorktree(
              Object.assign(
                {
                  cwd: workspaceRoot,
                  worktreesDir: config.worktreesDir,
                  baseBranch: input.baseBranch,
                  branch,
                },
                input.startFromOrigin === undefined
                  ? {}
                  : { startFromOrigin: input.startFromOrigin },
              ),
            ),
          )
        }),
      ),
    draft: (input) =>
      scoped(
        Effect.gen(function* () {
          const { cwd } = yield* resolveWorkspaceCwd(input)
          const context = yield* git.diffContext(cwd)
          const generated = yield* textGeneration
            .generateGitDraft({ cwd, kind: input.kind, context })
            .pipe(
              Effect.mapError(
                (error) =>
                  new GitCommandError({
                    operation: "git.draft",
                    detail: error.detail,
                  }),
              ),
            )
          return generated.body === undefined
            ? { title: generated.title }
            : { title: generated.title, body: generated.body }
        }),
      ),
    runStackedAction: (input) =>
      scoped(
        resolveWorkspaceCwd(input).pipe(
          Effect.flatMap(({ cwd }) =>
            refreshAfter(
              cwd,
              git.runStackedAction(
                Object.assign(
                  { cwd, action: input.action },
                  input.commitMessage === undefined ? {} : { commitMessage: input.commitMessage },
                  input.pullRequestTitle === undefined
                    ? {}
                    : { pullRequestTitle: input.pullRequestTitle },
                  input.pullRequestBody === undefined
                    ? {}
                    : { pullRequestBody: input.pullRequestBody },
                ),
              ),
            ),
          ),
        ),
      ),
    githubAccount: (scope) =>
      scoped(
        resolveWorkspaceCwd(scope).pipe(
          Effect.flatMap(({ cwd }) =>
            git
              .githubAccount(cwd)
              .pipe(Effect.catchTag("GitCommandError", () => Effect.succeed({ login: null }))),
          ),
        ),
      ),
    getPullRequest: (input) =>
      scoped(
        resolveWorkspaceCwd(input).pipe(
          Effect.flatMap(({ cwd }) => git.getPullRequest(cwd, input.number)),
        ),
      ),
    publishRepository: (input) =>
      scoped(
        resolveWorkspaceCwd(input).pipe(
          Effect.flatMap(({ cwd }) =>
            refreshAfter(
              cwd,
              git.publishRepository({
                cwd,
                repository: input.repository,
                visibility: input.visibility,
              }),
            ),
          ),
        ),
      ),
  })
})

export const gitPlaneLayer = Layer.effect(GitPlane, makeGitPlane()).pipe(
  Layer.provideMerge(vcsStatusBroadcasterLayer),
  Layer.provideMerge(gitRuntimeLayer),
)
