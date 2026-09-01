import { assert, it as standaloneIt } from "@effect/vitest"
import { ThreadId } from "@noyau/contracts/ids"
import { memoryLayer } from "@noyau/server/persistence/sqlite"
import {
  emptyProviderStatuses,
  ProviderPort,
  type ProviderPortService,
} from "@noyau/server/provider/provider-port"
import {
  makeProviderSessionReaper,
  type ProviderSessionReaperService,
} from "@noyau/server/provider/provider-session-reaper"
import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

const projectId = "10000000-0000-4000-8000-000000000001"
const timestamp = "2026-08-25T00:00:00.000Z"
const staleTimestamp = "2026-08-24T23:00:00.000Z"
const staleThreadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const activeThreadId = ThreadId.make("20000000-0000-4000-8000-000000000002")
const freshThreadId = ThreadId.make("20000000-0000-4000-8000-000000000003")
const orphanThreadId = ThreadId.make("20000000-0000-4000-8000-000000000004")

const providerLayer = (stopped: Array<ThreadId>, liveSessions: ReadonlySet<ThreadId>) => {
  const provider: ProviderPortService = {
    status: Effect.succeed(emptyProviderStatuses),
    listSkills: () => Effect.succeed([]),
    startTurn: () => Effect.void,
    interrupt: () => Effect.void,
    stop: (threadId) => Effect.sync(() => void stopped.push(threadId)),
    reapIdle: (threadId) =>
      Effect.succeed(liveSessions.has(threadId)).pipe(
        Effect.tap((reaped) =>
          reaped ? Effect.sync(() => void stopped.push(threadId)) : Effect.void,
        ),
      ),
    stopAll: Effect.void,
    respondApproval: () => Effect.void,
    respondUserInput: () => Effect.void,
    drain: Effect.void,
  }
  return Layer.succeed(ProviderPort)(provider)
}

const seedProjection = Effect.gen(function* () {
  const sql = yield* SqlClient
  yield* sql`
    INSERT INTO projection_projects (
      project_id, name, workspace_root, available, created_at, updated_at
    ) VALUES (
      ${projectId}, 'Reaper', '/tmp/reaper', 1, ${timestamp}, ${timestamp}
    )
  `
  yield* sql`
    INSERT INTO projection_threads (
      thread_id, project_id, title, provider, runtime_mode, status, created_at, updated_at
    ) VALUES
      (${staleThreadId}, ${projectId}, 'stale', 'cursor', 'full-access', 'active', ${timestamp}, ${staleTimestamp}),
      (${activeThreadId}, ${projectId}, 'active', 'cursor', 'full-access', 'active', ${timestamp}, ${staleTimestamp}),
      (${freshThreadId}, ${projectId}, 'fresh', 'cursor', 'full-access', 'active', ${timestamp}, ${timestamp}),
      (${orphanThreadId}, ${projectId}, 'orphan', 'cursor', 'full-access', 'active', ${timestamp}, ${staleTimestamp})
  `
  yield* sql`
    INSERT INTO projection_sessions (
      thread_id, status, last_error, active_turn_id, runtime_mode, resume_cursor, updated_at
    ) VALUES
      (${staleThreadId}, 'ready', NULL, NULL, 'full-access', NULL, ${staleTimestamp}),
      (${activeThreadId}, 'running', NULL, 'turn-active', 'full-access', NULL, ${staleTimestamp}),
      (${freshThreadId}, 'ready', NULL, NULL, 'full-access', NULL, ${timestamp}),
      (${orphanThreadId}, 'ready', NULL, NULL, 'full-access', NULL, ${staleTimestamp})
  `
})

const withReaper = <A, E>(
  use: (
    sql: SqlClient,
    reaper: ProviderSessionReaperService,
    stopped: Array<ThreadId>,
  ) => Effect.Effect<A, E>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const stopped: Array<ThreadId> = []
      const services = yield* Layer.build(
        Layer.mergeAll(memoryLayer, providerLayer(stopped, new Set([staleThreadId]))),
      )
      const sql = yield* Effect.service(SqlClient).pipe(Effect.provideContext(services))
      yield* seedProjection.pipe(Effect.provideContext(services))
      const reaper = yield* makeProviderSessionReaper({
        inactivityThresholdMs: 30 * 60 * 1_000,
        now: () => Date.parse(timestamp),
      }).pipe(Effect.provideContext(services))
      return yield* use(sql, reaper, stopped)
    }),
  )

standaloneIt.effect("reaps only stale Sessions without an active Turn", () =>
  withReaper((_, reaper, stopped) =>
    Effect.gen(function* () {
      assert.strictEqual(yield* reaper.sweep, 1)
      assert.deepStrictEqual(stopped, [staleThreadId])
    }),
  ),
)
