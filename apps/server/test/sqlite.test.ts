import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, describe, it as standaloneIt, layer } from "@effect/vitest"
import {
  migrations,
  migrationsThroughThreadForks,
  migrationsThroughContextUsage,
  migrationsThroughTurnDiff,
  runMigrations,
  threadProviderCodexMigration,
  threadProviderInstanceMigration,
} from "@noyau/server/persistence/migrations"
import * as NodeSqliteClient from "@noyau/server/persistence/node-sqlite-client"
import { recoverSessionsAfterBoot } from "@noyau/server/persistence/session-recovery"
import { layer as sqliteLayer, memoryLayer } from "@noyau/server/persistence/sqlite"
import { Context, DateTime, Effect, FileSystem, Layer, Path } from "effect"
import * as Migrator from "effect/unstable/sql/Migrator"
import { SqlClient } from "effect/unstable/sql/SqlClient"

const platformLayer = Layer.mergeAll(NodeFileSystem.layer, Path.layer)

describe("SQLite persistence", () => {
  layer(memoryLayer)((it) => {
    it.effect("applique les pragmas requis et les migrations sans outbox", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient
        const busy = yield* sql<{ timeout: number }>`PRAGMA busy_timeout`
        const foreignKeys = yield* sql<{ foreign_keys: number }>`PRAGMA foreign_keys`
        const tables = yield* sql<{ name: string }>`
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
          ORDER BY name
        `

        assert.strictEqual(busy[0]?.timeout, 5_000)
        assert.strictEqual(foreignKeys[0]?.foreign_keys, 1)
        assert.includeMembers(
          tables.map(({ name }) => name),
          [
            "aggregate_heads",
            "events",
            "projection_columns",
            "projection_projects",
            "projection_sessions",
            "projection_threads",
            "projection_tickets",
            "projection_transcript",
            "projection_turns",
            "receipts",
          ],
        )
        assert.notInclude(
          tables.map(({ name }) => name),
          "outbox",
        )
        assert.deepStrictEqual(yield* runMigrations(), [])
      }),
    )

    it.effect("annule ensemble journal, projection et receipt", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient
        yield* sql`CREATE TABLE rollback_probe (value INTEGER NOT NULL)`

        const failure = yield* Effect.exit(
          sql.withTransaction(
            Effect.gen(function* () {
              yield* sql`INSERT INTO rollback_probe (value) VALUES (1)`
              yield* sql`
                INSERT INTO receipts (
                  command_id, aggregate_kind, aggregate_id, command, response, created_at
                ) VALUES ('rollback', 'probe', 'one', '{}', '{}', '2026-08-20T00:00:00.000Z')
              `
              return yield* Effect.fail("rollback")
            }),
          ),
        )
        assert.isTrue(failure._tag === "Failure")

        const projection = yield* sql<{ total: number }>`
          SELECT COUNT(*) AS total FROM rollback_probe
        `
        const receipts = yield* sql<{ total: number }>`
          SELECT COUNT(*) AS total FROM receipts WHERE command_id = 'rollback'
        `
        assert.strictEqual(projection[0]?.total, 0)
        assert.strictEqual(receipts[0]?.total, 0)
      }),
    )

    it.effect("répare tous les turns running des sessions live au boot", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient
        const recoveredAt = DateTime.makeUnsafe("2026-08-26T12:00:00.000Z")

        yield* sql`
          INSERT INTO projection_projects (
            project_id, name, workspace_root, available, created_at, updated_at
          ) VALUES (
            'proj-recovery', 'noyau', '/tmp/recovery', 1,
            '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
          )
        `
        yield* sql`
          INSERT INTO projection_threads (
            thread_id, project_id, title, provider, runtime_mode, status, created_at, updated_at
          ) VALUES (
            'thread-recovery', 'proj-recovery', 'Recovery', 'cursor', 'full-access', 'active',
            '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
          )
        `
        yield* sql`
          INSERT INTO projection_turns (
            turn_id, thread_id, ordinal, state, requested_at, completed_at
          ) VALUES
            (
              'turn-completed', 'thread-recovery', 1, 'completed',
              '2026-08-20T00:01:00.000Z', '2026-08-20T00:02:00.000Z'
            ),
            (
              'turn-running', 'thread-recovery', 2, 'running',
              '2026-08-20T00:03:00.000Z', NULL
            )
        `
        yield* sql`
          INSERT INTO projection_sessions (
            thread_id, status, last_error, active_turn_id, runtime_mode, resume_cursor, updated_at
          ) VALUES (
            'thread-recovery', 'running', NULL, 'turn-completed', 'full-access', NULL,
            '2026-08-20T00:03:00.000Z'
          )
        `

        yield* recoverSessionsAfterBoot(recoveredAt)

        const turns = yield* sql<{ turn_id: string; state: string }>`
          SELECT turn_id, state FROM projection_turns ORDER BY ordinal
        `
        assert.deepStrictEqual(turns, [
          { turn_id: "turn-completed", state: "completed" },
          { turn_id: "turn-running", state: "error" },
        ])
      }),
    )
  })

  layer(platformLayer)((it) => {
    it.effect("active WAL sur un fichier possédé par la connexion Node", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-sqlite-" })
        const filename = path.join(directory, "state.sqlite")
        const context = yield* Layer.build(sqliteLayer({ filename }))
        const sql = Context.get(context, SqlClient)
        const rows = yield* sql<{ journal_mode: string }>`PRAGMA journal_mode`
        assert.strictEqual(rows[0]?.journal_mode, "wal")
      }),
    )
  })

  standaloneIt.effect("ferme la connexion avec son Scope", () =>
    Layer.build(sqliteLayer({ filename: ":memory:" })).pipe(Effect.scoped, Effect.asVoid),
  )

  layer(NodeSqliteClient.layer({ filename: ":memory:" }))((it) => {
    it.effect("016 indexe les prompts pending lors d'une mise à niveau", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const context = yield* Layer.build(NodeSqliteClient.layer({ filename: ":memory:" }))
          const sql = Context.get(context, SqlClient)
          return yield* Effect.gen(function* () {
            const migrate = Migrator.make({})
            yield* migrate({ loader: migrationsThroughThreadForks })

            const before = yield* sql<{ name: string }>`
          SELECT name
          FROM sqlite_master
          WHERE type = 'index'
            AND name LIKE 'projection_transcript_pending_%'
          ORDER BY name
        `
            assert.deepStrictEqual(before, [])

            yield* sql`
          INSERT INTO projection_projects (
            project_id, name, workspace_root, available, created_at, updated_at
          ) VALUES (
            'proj-indexes', 'Indexes', '/tmp/indexes', 1,
            '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
          )
        `
            yield* sql`
          INSERT INTO projection_threads (
            thread_id, project_id, title, provider, runtime_mode, status, created_at, updated_at
          ) VALUES (
            'thread-indexes', 'proj-indexes', 'Indexes', 'codex', 'full-access', 'active',
            '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
          )
        `
            yield* sql`
          INSERT INTO projection_turns (
            turn_id, thread_id, ordinal, state, requested_at
          ) VALUES (
            'turn-indexes', 'thread-indexes', 1, 'running', '2026-08-20T00:00:00.000Z'
          )
        `
            yield* sql`
          INSERT INTO projection_transcript (
            transcript_id, thread_id, turn_id, ordinal, kind, item, event_sequence
          ) VALUES
            (
              'permission-pending', 'thread-indexes', 'turn-indexes', 1,
              'transcript.permission', '{"status":"pending"}', 1
            ),
            (
              'permission-resolved', 'thread-indexes', 'turn-indexes', 2,
              'transcript.permission', '{"status":"resolved"}', 2
            ),
            (
              'user-input-pending', 'thread-indexes', 'turn-indexes', 3,
              'transcript.user-input', '{"status":"pending"}', 3
            ),
            (
              'user-input-resolved', 'thread-indexes', 'turn-indexes', 4,
              'transcript.user-input', '{"status":"resolved"}', 4
            )
        `

            yield* migrate({ loader: migrations })

            const after = yield* sql<{ name: string }>`
          SELECT name
          FROM sqlite_master
          WHERE type = 'index'
            AND name LIKE 'projection_transcript_pending_%'
          ORDER BY name
        `
            assert.deepStrictEqual(after, [
              { name: "projection_transcript_pending_permission_idx" },
              { name: "projection_transcript_pending_user_input_idx" },
            ])
            const transcript = yield* sql<{ transcript_id: string; item: string }>`
          SELECT transcript_id, item
          FROM projection_transcript
          WHERE thread_id = 'thread-indexes'
          ORDER BY ordinal
        `
            assert.deepStrictEqual(transcript, [
              { transcript_id: "permission-pending", item: '{"status":"pending"}' },
              { transcript_id: "permission-resolved", item: '{"status":"resolved"}' },
              { transcript_id: "user-input-pending", item: '{"status":"pending"}' },
              { transcript_id: "user-input-resolved", item: '{"status":"resolved"}' },
            ])
            const permissionPlan = yield* sql<{ detail: string }>`
          EXPLAIN QUERY PLAN
          SELECT EXISTS (
            SELECT 1
            FROM projection_transcript AS pending
            WHERE pending.thread_id = 'thread-indexes'
              AND pending.kind = 'transcript.permission'
              AND json_extract(pending.item, '$.status') = 'pending'
          )
        `
            const userInputPlan = yield* sql<{ detail: string }>`
          EXPLAIN QUERY PLAN
          SELECT EXISTS (
            SELECT 1
            FROM projection_transcript AS pending
            WHERE pending.thread_id = 'thread-indexes'
              AND pending.kind = 'transcript.user-input'
              AND json_extract(pending.item, '$.status') = 'pending'
          )
        `
            assert.isTrue(
              permissionPlan.some(({ detail }) =>
                detail.includes("projection_transcript_pending_permission_idx"),
              ),
            )
            assert.isTrue(
              userInputPlan.some(({ detail }) =>
                detail.includes("projection_transcript_pending_user_input_idx"),
              ),
            )
            assert.deepStrictEqual(yield* migrate({ loader: migrations }), [])
          }).pipe(Effect.provideService(SqlClient, sql))
        }),
      ),
    )

    it.effect("009 rebuild les threads sans cascade sur les enfants", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient
        yield* sql`PRAGMA foreign_keys = ON`
        yield* Migrator.make({})({
          loader: migrationsThroughTurnDiff,
        })

        yield* sql`
          INSERT INTO projection_projects (
            project_id, name, workspace_root, available, created_at, updated_at
          ) VALUES (
            'proj-1', 'noyau', '/tmp/noyau', 1, '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
          )
        `
        yield* sql`
          INSERT INTO projection_threads (
            thread_id, project_id, title, provider, runtime_mode, status, created_at, updated_at
          ) VALUES (
            'thread-1', 'proj-1', 'Cascade', 'cursor', 'full-access', 'active',
            '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
          )
        `
        yield* sql`
          INSERT INTO projection_sessions (
            thread_id, status, last_error, active_turn_id, runtime_mode, resume_cursor, updated_at
          ) VALUES (
            'thread-1', 'idle', NULL, NULL, 'full-access', '{"schemaVersion":1,"sessionId":"s1"}',
            '2026-08-20T00:00:00.000Z'
          )
        `
        yield* sql`
          INSERT INTO projection_turns (
            turn_id, thread_id, ordinal, state, requested_at, checkpoint_ref, checkpoint_status
          ) VALUES (
            'turn-1', 'thread-1', 1, 'completed', '2026-08-20T00:00:00.000Z',
            'refs/noyau/checkpoint/thread-1/1', 'ready'
          )
        `
        yield* sql`
          INSERT INTO projection_transcript (
            transcript_id, thread_id, turn_id, ordinal, kind, item, event_sequence
          ) VALUES (
            'tx-1', 'thread-1', 'turn-1', 1, 'assistant', '{}', 1
          )
        `
        yield* sql`
          INSERT INTO projection_columns (
            column_id, project_id, name, color, rank, done, created_at, updated_at
          ) VALUES (
            'col-1', 'proj-1', 'Backlog', '#000', 'a', 0, '2026-08-20T00:00:00.000Z',
            '2026-08-20T00:00:00.000Z'
          )
        `
        yield* sql`
          INSERT INTO projection_tickets (
            ticket_id, project_id, column_id, rank, title, priority, done, created_at, updated_at
          ) VALUES (
            'ticket-1', 'proj-1', 'col-1', 'a', 'Ticket', 'none', 0,
            '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
          )
        `
        yield* sql`
          INSERT INTO projection_ticket_threads (ticket_id, thread_id)
          VALUES ('ticket-1', 'thread-1')
        `

        yield* threadProviderCodexMigration

        const leftovers = yield* sql<{
          sessions: number
          turns: number
          transcript: number
          links: number
          provider: string
          checkpoint: string | null
        }>`
          SELECT
            (SELECT COUNT(*) FROM projection_sessions) AS sessions,
            (SELECT COUNT(*) FROM projection_turns) AS turns,
            (SELECT COUNT(*) FROM projection_transcript) AS transcript,
            (SELECT COUNT(*) FROM projection_ticket_threads) AS links,
            (SELECT provider FROM projection_threads WHERE thread_id = 'thread-1') AS provider,
            (SELECT checkpoint_ref FROM projection_turns WHERE turn_id = 'turn-1') AS checkpoint
        `
        assert.deepStrictEqual(leftovers[0], {
          sessions: 1,
          turns: 1,
          transcript: 1,
          links: 1,
          provider: "cursor",
          checkpoint: "refs/noyau/checkpoint/thread-1/1",
        })

        yield* sql`
          INSERT INTO projection_threads (
            thread_id, project_id, title, provider, runtime_mode, status, created_at, updated_at
          ) VALUES (
            'thread-2', 'proj-1', 'Codex', 'codex', 'full-access', 'active',
            '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
          )
        `

        yield* sql`DELETE FROM projection_projects WHERE project_id = 'proj-1'`
        const afterDelete = yield* sql<{ threads: number; sessions: number; turns: number }>`
          SELECT
            (SELECT COUNT(*) FROM projection_threads) AS threads,
            (SELECT COUNT(*) FROM projection_sessions) AS sessions,
            (SELECT COUNT(*) FROM projection_turns) AS turns
        `
        assert.deepStrictEqual(afterDelete[0], { threads: 0, sessions: 0, turns: 0 })
      }),
    )

    it.effect("014 ouvre provider aux instance ids hors du CHECK fermé", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient
        yield* sql`PRAGMA foreign_keys = ON`
        yield* Migrator.make({})({
          loader: migrationsThroughContextUsage,
        })

        yield* sql`
          INSERT INTO projection_projects (
            project_id, name, workspace_root, available, created_at, updated_at
          ) VALUES (
            'proj-1', 'noyau', '/tmp/noyau', 1, '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
          )
        `
        yield* sql`
          INSERT INTO projection_threads (
            thread_id, project_id, title, provider, runtime_mode, status, created_at, updated_at
          ) VALUES (
            'thread-1', 'proj-1', 'Cursor', 'cursor', 'full-access', 'active',
            '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
          )
        `
        yield* sql`
          INSERT INTO projection_sessions (
            thread_id, status, last_error, active_turn_id, runtime_mode, resume_cursor, updated_at
          ) VALUES (
            'thread-1', 'idle', NULL, NULL, 'full-access', '{"schemaVersion":1,"sessionId":"s1"}',
            '2026-08-20T00:00:00.000Z'
          )
        `

        const rejected = yield* Effect.exit(
          sql`
            INSERT INTO projection_threads (
              thread_id, project_id, title, provider, runtime_mode, status, created_at, updated_at
            ) VALUES (
              'thread-claude', 'proj-1', 'Claude', 'claude', 'full-access', 'active',
              '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
            )
          `,
        )
        assert.isTrue(rejected._tag === "Failure")

        yield* threadProviderInstanceMigration

        const leftovers = yield* sql<{ sessions: number; provider: string }>`
          SELECT
            (SELECT COUNT(*) FROM projection_sessions) AS sessions,
            (SELECT provider FROM projection_threads WHERE thread_id = 'thread-1') AS provider
        `
        assert.deepStrictEqual(leftovers[0], { sessions: 1, provider: "cursor" })

        yield* sql`
          INSERT INTO projection_threads (
            thread_id, project_id, title, provider, runtime_mode, status, created_at, updated_at
          ) VALUES
            (
              'thread-claude', 'proj-1', 'Claude', 'claude', 'full-access', 'active',
              '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
            ),
            (
              'thread-grok', 'proj-1', 'Grok', 'grok', 'full-access', 'active',
              '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
            )
        `

        const inserted = yield* sql<{ provider: string }>`
          SELECT provider FROM projection_threads ORDER BY thread_id
        `
        assert.deepStrictEqual(
          inserted.map((row) => row.provider),
          ["cursor", "claude", "grok"],
        )
      }),
    )
  })
})
