import { assert, layer } from "@effect/vitest"
import { type DomainEvent } from "@noyau/contracts/events"
import { ActorId, ProjectId, ThreadId, TurnId } from "@noyau/contracts/ids"
import {
  ThreadMetaUpdated,
  ThreadTurnEnded,
  ThreadTurnStarted,
} from "@noyau/contracts/thread/events"
import { GitRuntime, type GitRuntimeService } from "@noyau/server/git/git-runtime"
import { makeTurnDiffReactor, type DispatchInternal } from "@noyau/server/git/turn-diff-reactor"
import type { PersistedEvent } from "@noyau/server/persistence/command-worker"
import { memoryLayer } from "@noyau/server/persistence/sqlite"
import { Crypto, DateTime, Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

const ids = {
  project: Schema.decodeSync(ProjectId)("10000000-0000-4000-8000-000000000001"),
  guardProject: Schema.decodeSync(ProjectId)("10000000-0000-4000-8000-000000000002"),
  thread: Schema.decodeSync(ThreadId)("20000000-0000-4000-8000-000000000001"),
  otherThread: Schema.decodeSync(ThreadId)("20000000-0000-4000-8000-000000000002"),
  guardThread: Schema.decodeSync(ThreadId)("20000000-0000-4000-8000-000000000003"),
  firstTurn: Schema.decodeSync(TurnId)("30000000-0000-4000-8000-000000000001"),
  secondTurn: Schema.decodeSync(TurnId)("30000000-0000-4000-8000-000000000002"),
  missingTurn: Schema.decodeSync(TurnId)("30000000-0000-4000-8000-000000000003"),
  guardTurn: Schema.decodeSync(TurnId)("30000000-0000-4000-8000-000000000004"),
  actor: Schema.decodeSync(ActorId)("system:test"),
}

const at = DateTime.makeUnsafe("2026-08-20T00:00:00.000Z")
const transcriptItem = JSON.stringify({
  _tag: "transcript.assistant",
  threadId: ids.thread,
  turnId: ids.firstTurn,
  text: "A sizable historical assistant transcript. ".repeat(256),
})

const persisted = (event: DomainEvent, sequence: number): PersistedEvent<DomainEvent> => ({
  eventId: `40000000-0000-4000-8000-00000000000${sequence}`,
  sequence,
  projectId: ids.project,
  actorId: ids.actor,
  correlationId: "50000000-0000-4000-8000-000000000001",
  causationId: "60000000-0000-4000-8000-000000000001",
  occurredAt: at,
  schemaVersion: 1,
  aggregate: { kind: "thread", id: ids.thread },
  aggregateVersion: sequence,
  event,
})

const testCrypto = () =>
  Crypto.make({
    randomBytes: (size) => new Uint8Array(size),
    digest: (_algorithm, data) => Effect.succeed(data),
  })

const unexpected = (operation: string) =>
  Effect.die(`Unexpected GitRuntime operation: ${operation}`)

interface GitCalls {
  readonly repositories: Array<string>
  readonly existingRefs: Array<string>
  readonly captures: Array<string>
  readonly diffs: Array<{ readonly from: string; readonly to: string }>
}

const trackSql = (sql: SqlClient, queries: Array<string>) =>
  new Proxy(sql, {
    apply(target, _thisArg, args) {
      const [strings, ...values] = args
      queries.push(Array.from(strings).join("?"))
      return target(strings, ...values)
    },
  })

const makeGitRuntime = (calls: GitCalls): GitRuntimeService => ({
  status: () => unexpected("status"),
  listRefs: () => unexpected("listRefs"),
  listWorktrees: () => unexpected("listWorktrees"),
  switchRef: () => unexpected("switchRef"),
  createRef: () => unexpected("createRef"),
  createWorktree: () => unexpected("createWorktree"),
  renameBranch: () => unexpected("renameBranch"),
  isGitRepository: (cwd) =>
    Effect.sync(() => {
      calls.repositories.push(cwd)
      return true
    }),
  captureCheckpoint: ({ checkpointRef }) =>
    Effect.sync(() => {
      calls.captures.push(checkpointRef)
    }),
  hasCheckpointRef: ({ checkpointRef }) =>
    Effect.sync(() => {
      calls.existingRefs.push(checkpointRef)
      return true
    }),
  diffCheckpoints: ({ fromCheckpointRef, toCheckpointRef }) =>
    Effect.sync(() => {
      calls.diffs.push({ from: fromCheckpointRef, to: toCheckpointRef })
      return "1\t0\tsrc/index.ts\n"
    }),
  diffContext: () => unexpected("diffContext"),
  runStackedAction: () => unexpected("runStackedAction"),
  githubAccount: () => unexpected("githubAccount"),
  getPullRequest: () => unexpected("getPullRequest"),
  submitPullRequestReview: () => unexpected("submitPullRequestReview"),
  publishRepository: () => unexpected("publishRepository"),
})

layer(memoryLayer)("TurnDiffReactor", (it) => {
  it.effect("reads only narrow checkpoint context through the turn lifecycle", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient
      yield* sql`
        INSERT INTO projection_projects (
          project_id, name, workspace_root, available, created_at, updated_at
        ) VALUES (
          ${ids.project}, 'Noyau', '/tmp/workspace', 1,
          '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
        )
      `
      yield* sql`
        INSERT INTO projection_threads (
          thread_id, project_id, title, provider, runtime_mode, worktree_path,
          status, created_at, updated_at
        ) VALUES (
          ${ids.thread}, ${ids.project}, 'Thread', 'cursor', 'full-access', '/tmp/worktree',
          'active', '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
        )
      `
      yield* sql`
        INSERT INTO projection_turns (
          turn_id, thread_id, ordinal, state, requested_at
        ) VALUES
          (${ids.firstTurn}, ${ids.thread}, 1, 'completed', '2026-08-20T00:00:00.000Z'),
          (${ids.secondTurn}, ${ids.thread}, 2, 'running', '2026-08-20T00:01:00.000Z')
      `
      yield* sql`
        INSERT INTO projection_transcript (
          transcript_id, thread_id, turn_id, ordinal, kind, item, event_sequence
        ) VALUES (
          'transcript-large-history', ${ids.thread}, ${ids.firstTurn}, 1,
          'transcript.assistant', ${transcriptItem}, 1
        )
      `

      const calls = {
        repositories: Array<string>(),
        existingRefs: Array<string>(),
        captures: Array<string>(),
        diffs: Array<{ readonly from: string; readonly to: string }>(),
      } satisfies GitCalls
      const dispatched: Array<unknown> = []
      const dispatchInternal: DispatchInternal = (command) =>
        Effect.sync(() => {
          dispatched.push(command)
        })
      const git = makeGitRuntime(calls)
      const queries: Array<string> = []
      const trackedSql = trackSql(sql, queries)
      const reactor = yield* makeTurnDiffReactor(dispatchInternal).pipe(
        Effect.provideService(GitRuntime, git),
        Effect.provideService(SqlClient, trackedSql),
        Effect.provideService(Crypto.Crypto, testCrypto()),
      )

      yield* reactor(
        persisted(ThreadTurnStarted.make({ threadId: ids.thread, turnId: ids.secondTurn }), 1),
      )
      assert.deepStrictEqual(calls.repositories, ["/tmp/worktree"])
      assert.deepStrictEqual(calls.captures, [])
      assert.isFalse(queries.some((query) => query.includes("projection_transcript")))

      queries.length = 0
      yield* sql`
        UPDATE projection_threads SET worktree_path = '/tmp/worktree-new' WHERE thread_id = ${ids.thread}
      `
      yield* reactor(
        persisted(
          ThreadMetaUpdated.make({
            threadId: ids.thread,
            worktreePath: "/tmp/worktree-new",
          }),
          2,
        ),
      )
      assert.deepStrictEqual(calls.repositories, ["/tmp/worktree", "/tmp/worktree-new"])
      assert.deepStrictEqual(calls.captures, [])
      assert.isFalse(queries.some((query) => query.includes("projection_transcript")))

      queries.length = 0
      yield* reactor(
        persisted(
          ThreadTurnEnded.make({ threadId: ids.thread, turnId: ids.firstTurn, state: "completed" }),
          3,
        ),
      )
      assert.deepStrictEqual(calls.captures, [
        "refs/noyau/checkpoint/20000000-0000-4000-8000-000000000001/1",
      ])
      assert.deepStrictEqual(calls.diffs, [
        {
          from: "refs/noyau/checkpoint/20000000-0000-4000-8000-000000000001/0",
          to: "refs/noyau/checkpoint/20000000-0000-4000-8000-000000000001/1",
        },
      ])
      assert.deepStrictEqual(calls.existingRefs, [
        "refs/noyau/checkpoint/20000000-0000-4000-8000-000000000001/1",
        "refs/noyau/checkpoint/20000000-0000-4000-8000-000000000001/1",
        "refs/noyau/checkpoint/20000000-0000-4000-8000-000000000001/0",
      ])
      assert.strictEqual(dispatched.length, 1)
      assert.isFalse(queries.some((query) => query.includes("projection_transcript")))

      const beforeMissing = {
        repositories: calls.repositories.length,
        captures: calls.captures.length,
        diffs: calls.diffs.length,
        dispatched: dispatched.length,
      }
      queries.length = 0
      yield* reactor(
        persisted(
          ThreadTurnEnded.make({
            threadId: ids.otherThread,
            turnId: ids.firstTurn,
            state: "completed",
          }),
          4,
        ),
      )
      yield* reactor(
        persisted(
          ThreadTurnEnded.make({
            threadId: ids.thread,
            turnId: ids.missingTurn,
            state: "completed",
          }),
          5,
        ),
      )
      assert.deepStrictEqual(calls.repositories.length, beforeMissing.repositories)
      assert.deepStrictEqual(calls.captures.length, beforeMissing.captures)
      assert.deepStrictEqual(calls.diffs.length, beforeMissing.diffs)
      assert.strictEqual(dispatched.length, beforeMissing.dispatched)
      assert.isFalse(queries.some((query) => query.includes("projection_transcript")))
    }),
  )

  it.effect("keeps the prepare-worktree baseline guard", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient
      yield* sql`
        INSERT INTO projection_projects (
          project_id, name, workspace_root, available, created_at, updated_at
        ) VALUES (
          ${ids.guardProject}, 'Noyau', '/tmp/workspace-guard', 1,
          '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
        )
      `
      yield* sql`
        INSERT INTO projection_threads (
          thread_id, project_id, title, provider, runtime_mode, worktree_path,
          status, created_at, updated_at
        ) VALUES (
          ${ids.guardThread}, ${ids.guardProject}, 'Thread', 'cursor', 'full-access', NULL,
          'active', '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
        )
      `
      yield* sql`
        INSERT INTO projection_turns (
          turn_id, thread_id, ordinal, state, requested_at
        ) VALUES (${ids.guardTurn}, ${ids.guardThread}, 2, 'running', '2026-08-20T00:01:00.000Z')
      `
      const repositories: Array<string> = []
      const git = makeGitRuntime({
        repositories,
        existingRefs: [],
        captures: [],
        diffs: [],
      })
      const queries: Array<string> = []
      const trackedSql = trackSql(sql, queries)
      const reactor = yield* makeTurnDiffReactor(() => Effect.void).pipe(
        Effect.provideService(GitRuntime, git),
        Effect.provideService(SqlClient, trackedSql),
        Effect.provideService(Crypto.Crypto, testCrypto()),
      )

      yield* reactor(
        persisted(
          ThreadTurnStarted.make({
            threadId: ids.guardThread,
            turnId: ids.guardTurn,
            prepareWorktree: { baseBranch: "main" },
          }),
          6,
        ),
      )
      assert.deepStrictEqual(repositories, [])
      assert.strictEqual(queries.length, 1)
      assert.isFalse(queries.some((query) => query.includes("projection_transcript")))
    }),
  )
})
