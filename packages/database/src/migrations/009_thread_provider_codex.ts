import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

/**
 * SQLite ne droppe pas un CHECK : rebuild pour accepter `codex`.
 *
 * `PRAGMA foreign_keys = OFF` est un no-op dans la txn Migrator. On rebuild
 * donc sans DROP d'une table encore référencée : enfants d'abord vers `_new`
 * (FK vers `projection_threads_new`), puis DROP des anciens, puis RENAME.
 */
const migration = Effect.gen(function* () {
  const sql = yield* SqlClient

  yield* sql`
    CREATE TABLE projection_threads_new (
      thread_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projection_projects(project_id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      provider TEXT NOT NULL CHECK (provider IN ('cursor', 'codex')),
      runtime_mode TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT,
      model_id TEXT,
      reasoning_effort TEXT,
      service_tier TEXT,
      thinking INTEGER CHECK (thinking IN (0, 1)),
      branch TEXT,
      worktree_path TEXT,
      settled_override TEXT CHECK (settled_override IN ('settled', 'active')),
      settled_at TEXT
    )
  `

  yield* sql`
    INSERT INTO projection_threads_new (
      thread_id, project_id, title, provider, runtime_mode, status,
      created_at, updated_at, archived_at, model_id, reasoning_effort,
      service_tier, thinking, branch, worktree_path, settled_override, settled_at
    )
    SELECT
      thread_id, project_id, title, provider, runtime_mode, status,
      created_at, updated_at, archived_at, model_id, reasoning_effort,
      service_tier, thinking, branch, worktree_path, settled_override, settled_at
    FROM projection_threads
  `

  yield* sql`
    CREATE TABLE projection_ticket_threads_new (
      ticket_id TEXT NOT NULL REFERENCES projection_tickets(ticket_id) ON DELETE CASCADE,
      thread_id TEXT NOT NULL REFERENCES projection_threads_new(thread_id) ON DELETE CASCADE,
      PRIMARY KEY (ticket_id, thread_id)
    )
  `

  yield* sql`
    INSERT INTO projection_ticket_threads_new (ticket_id, thread_id)
    SELECT ticket_id, thread_id FROM projection_ticket_threads
  `

  yield* sql`
    CREATE TABLE projection_sessions_new (
      thread_id TEXT PRIMARY KEY REFERENCES projection_threads_new(thread_id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      last_error TEXT,
      active_turn_id TEXT,
      runtime_mode TEXT NOT NULL,
      resume_cursor TEXT,
      updated_at TEXT NOT NULL
    )
  `

  yield* sql`
    INSERT INTO projection_sessions_new (
      thread_id, status, last_error, active_turn_id, runtime_mode, resume_cursor, updated_at
    )
    SELECT
      thread_id, status, last_error, active_turn_id, runtime_mode, resume_cursor, updated_at
    FROM projection_sessions
  `

  yield* sql`
    CREATE TABLE projection_turns_new (
      turn_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES projection_threads_new(thread_id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL CHECK (ordinal >= 1),
      state TEXT NOT NULL CHECK (state IN ('running', 'interrupted', 'completed', 'error')),
      requested_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      checkpoint_ref TEXT,
      checkpoint_status TEXT CHECK (checkpoint_status IN ('ready', 'missing', 'error')),
      checkpoint_files_json TEXT,
      UNIQUE (thread_id, ordinal)
    )
  `

  yield* sql`
    INSERT INTO projection_turns_new (
      turn_id, thread_id, ordinal, state, requested_at, started_at, completed_at,
      checkpoint_ref, checkpoint_status, checkpoint_files_json
    )
    SELECT
      turn_id, thread_id, ordinal, state, requested_at, started_at, completed_at,
      checkpoint_ref, checkpoint_status, checkpoint_files_json
    FROM projection_turns
  `

  yield* sql`
    CREATE TABLE projection_transcript_new (
      transcript_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES projection_threads_new(thread_id) ON DELETE CASCADE,
      turn_id TEXT NOT NULL REFERENCES projection_turns_new(turn_id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL CHECK (ordinal >= 1),
      kind TEXT NOT NULL,
      item TEXT NOT NULL,
      event_sequence INTEGER NOT NULL,
      UNIQUE (thread_id, ordinal)
    )
  `

  yield* sql`
    INSERT INTO projection_transcript_new (
      transcript_id, thread_id, turn_id, ordinal, kind, item, event_sequence
    )
    SELECT
      transcript_id, thread_id, turn_id, ordinal, kind, item, event_sequence
    FROM projection_transcript
  `

  yield* sql`DROP TABLE projection_transcript`
  yield* sql`DROP TABLE projection_turns`
  yield* sql`DROP TABLE projection_sessions`
  yield* sql`DROP TABLE projection_ticket_threads`
  yield* sql`DROP TABLE projection_threads`

  yield* sql`ALTER TABLE projection_threads_new RENAME TO projection_threads`
  yield* sql`ALTER TABLE projection_ticket_threads_new RENAME TO projection_ticket_threads`
  yield* sql`ALTER TABLE projection_sessions_new RENAME TO projection_sessions`
  yield* sql`ALTER TABLE projection_turns_new RENAME TO projection_turns`
  yield* sql`ALTER TABLE projection_transcript_new RENAME TO projection_transcript`

  yield* sql`
    CREATE INDEX projection_threads_project_idx
      ON projection_threads (project_id, created_at, thread_id)
  `
  yield* sql`
    CREATE INDEX projection_ticket_threads_thread_idx
      ON projection_ticket_threads (thread_id, ticket_id)
  `
  yield* sql`
    CREATE INDEX projection_turns_thread_idx
      ON projection_turns (thread_id, ordinal)
  `
  yield* sql`
    CREATE INDEX projection_transcript_thread_idx
      ON projection_transcript (thread_id, ordinal)
  `
})

export default migration
