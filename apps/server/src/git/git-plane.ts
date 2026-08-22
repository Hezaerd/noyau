import { ServiceUnavailable } from "@noyau/protocol/errors"
import {
  GitCommandError,
  type GitDraftInput,
  type GitDraftResult,
  type GitRunStackedActionInput,
  type GitRunStackedActionResult,
  type VcsCreateRefInput,
  type VcsCreateRefResult,
  type VcsCreateWorktreeInput,
  type VcsCreateWorktreeResult,
  type VcsListRefsResult,
  type VcsScope,
  type VcsStatusResult,
  type VcsSwitchRefInput,
  type VcsSwitchRefResult,
} from "@noyau/protocol/git"
import { ServerConfig } from "@noyau/server/config"
import { TextGeneration } from "@noyau/server/text-generation/text-generation"
import { Context, Crypto, Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

import { buildTemporaryWorktreeBranchName, GitRuntime, gitRuntimeLayer } from "./git-runtime.ts"

const ProjectRootRow = Schema.Struct({ workspace_root: Schema.NonEmptyString })
const ThreadCheckoutRow = Schema.Struct({
  worktree_path: Schema.NullOr(Schema.String),
})
const decodeProjectRootRow = Schema.decodeEffect(ProjectRootRow)
const decodeThreadCheckoutRow = Schema.decodeEffect(ThreadCheckoutRow)

const unavailable = (service: string) => new ServiceUnavailable({ service })

export interface GitPlaneService {
  readonly status: (
    scope: VcsScope,
  ) => Effect.Effect<VcsStatusResult, GitCommandError | ServiceUnavailable>
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
}

export class GitPlane extends Context.Service<GitPlane, GitPlaneService>()(
  "@noyau/server/git/GitPlane",
) {}

const resolveCwd = Effect.fn("GitPlane.resolveCwd")(function* (scope: VcsScope) {
  const sql = yield* SqlClient
  const projectRows = yield* sql<
    (typeof ProjectRootRow)["Encoded"]
  >`SELECT workspace_root FROM projection_projects WHERE project_id = ${scope.projectId}`.pipe(
    Effect.mapError(() => unavailable("sqlite")),
  )
  const projectRow = projectRows[0]
  if (projectRow === undefined) {
    return yield* unavailable("project")
  }
  const workspaceRoot = (yield* decodeProjectRootRow(projectRow).pipe(Effect.orDie)).workspace_root
  if (scope.threadId === undefined) {
    return { cwd: workspaceRoot, workspaceRoot }
  }
  const threadRows = yield* sql<
    (typeof ThreadCheckoutRow)["Encoded"]
  >`SELECT worktree_path FROM projection_threads WHERE thread_id = ${scope.threadId}`.pipe(
    Effect.mapError(() => unavailable("sqlite")),
  )
  const threadRow = threadRows[0]
  if (threadRow === undefined) {
    return { cwd: workspaceRoot, workspaceRoot }
  }
  const worktreePath = (yield* decodeThreadCheckoutRow(threadRow).pipe(Effect.orDie)).worktree_path
  return {
    cwd: worktreePath !== null && worktreePath.length > 0 ? worktreePath : workspaceRoot,
    workspaceRoot,
  }
})

const makeGitPlane = Effect.fn("GitPlane.make")(function* () {
  const git = yield* GitRuntime
  const textGeneration = yield* TextGeneration
  const config = yield* ServerConfig
  const crypto = yield* Crypto.Crypto
  const sql = yield* SqlClient
  const scoped = <A, E>(effect: Effect.Effect<A, E, SqlClient>) =>
    effect.pipe(Effect.provideService(SqlClient, sql))

  return GitPlane.of({
    status: (scope) => scoped(resolveCwd(scope).pipe(Effect.flatMap(({ cwd }) => git.status(cwd)))),
    listRefs: (scope) =>
      scoped(
        resolveCwd(scope).pipe(
          Effect.flatMap(({ cwd }) =>
            git
              .status(cwd)
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
        resolveCwd(input).pipe(Effect.flatMap(({ cwd }) => git.switchRef(cwd, input.refName))),
      ),
    createRef: (input) =>
      scoped(
        resolveCwd(input).pipe(
          Effect.flatMap(({ cwd }) => git.createRef(cwd, input.refName, input.switchRef === true)),
        ),
      ),
    createWorktree: (input) =>
      scoped(
        Effect.gen(function* () {
          const { workspaceRoot } = yield* resolveCwd(input)
          const branch =
            input.branch ??
            buildTemporaryWorktreeBranchName(yield* crypto.randomUUIDv4.pipe(Effect.orDie))
          return yield* git.createWorktree(
            Object.assign(
              {
                cwd: workspaceRoot,
                worktreesDir: config.worktreesDir,
                baseBranch: input.baseBranch,
                branch,
              },
              input.startFromOrigin === undefined ? {} : { startFromOrigin: input.startFromOrigin },
            ),
          )
        }),
      ),
    draft: (input) =>
      scoped(
        Effect.gen(function* () {
          const { cwd } = yield* resolveCwd(input)
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
        resolveCwd(input).pipe(
          Effect.flatMap(({ cwd }) =>
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
  })
})

export const gitPlaneLayer = Layer.effect(GitPlane, makeGitPlane()).pipe(
  Layer.provideMerge(gitRuntimeLayer),
)
