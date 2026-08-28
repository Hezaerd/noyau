import { ServiceUnavailable } from "@noyau/contracts/errors"
import type { VcsScope } from "@noyau/contracts/git"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

const ProjectRootRow = Schema.Struct({ workspace_root: Schema.NonEmptyString })
const ThreadCheckoutRow = Schema.Struct({
  worktree_path: Schema.NullOr(Schema.String),
})
const decodeProjectRootRow = Schema.decodeEffect(ProjectRootRow)
const decodeThreadCheckoutRow = Schema.decodeEffect(ThreadCheckoutRow)

const unavailable = (service: string) => new ServiceUnavailable({ service })

export const resolveWorkspaceCwd = Effect.fn("resolveWorkspaceCwd")(function* (scope: VcsScope) {
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
