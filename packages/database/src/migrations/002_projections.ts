import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

/** Read models for the Environment shell, Board, and provider conversations. */
const migration = Effect.gen(function* () {
  const sql = yield* SqlClient

  yield* sql`
    CREATE TABLE projection_projects (
      project_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      workspace_root TEXT NOT NULL UNIQUE,
      available INTEGER NOT NULL CHECK (available IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `

  yield* sql`
    CREATE TABLE projection_threads (
      thread_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projection_projects(project_id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      provider TEXT NOT NULL CHECK (provider = 'cursor'),
      runtime_mode TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    )
  `

  yield* sql`
    CREATE INDEX projection_threads_project_idx
      ON projection_threads (project_id, created_at, thread_id)
  `

  yield* sql`
    CREATE TABLE projection_columns (
      column_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projection_projects(project_id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      rank TEXT NOT NULL,
      done INTEGER NOT NULL CHECK (done IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `

  yield* sql`
    CREATE UNIQUE INDEX projection_columns_rank_idx
      ON projection_columns (project_id, rank)
  `

  yield* sql`
    CREATE UNIQUE INDEX projection_columns_done_idx
      ON projection_columns (project_id)
      WHERE done = 1
  `

  yield* sql`
    CREATE TABLE projection_tickets (
      ticket_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projection_projects(project_id) ON DELETE CASCADE,
      column_id TEXT NOT NULL REFERENCES projection_columns(column_id),
      rank TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT NOT NULL,
      due_at TEXT,
      done INTEGER NOT NULL CHECK (done IN (0, 1)),
      archived_at TEXT,
      last_active_column_id TEXT REFERENCES projection_columns(column_id),
      assignee_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `

  yield* sql`
    CREATE INDEX projection_tickets_board_idx
      ON projection_tickets (project_id, column_id, rank, ticket_id)
  `

  yield* sql`
    CREATE TABLE projection_ticket_dependencies (
      ticket_id TEXT NOT NULL REFERENCES projection_tickets(ticket_id) ON DELETE CASCADE,
      depends_on_ticket_id TEXT NOT NULL REFERENCES projection_tickets(ticket_id) ON DELETE CASCADE,
      PRIMARY KEY (ticket_id, depends_on_ticket_id),
      CHECK (ticket_id <> depends_on_ticket_id)
    )
  `

  yield* sql`
    CREATE TABLE projection_ticket_threads (
      ticket_id TEXT NOT NULL REFERENCES projection_tickets(ticket_id) ON DELETE CASCADE,
      thread_id TEXT NOT NULL REFERENCES projection_threads(thread_id) ON DELETE CASCADE,
      PRIMARY KEY (ticket_id, thread_id)
    )
  `

  yield* sql`
    CREATE INDEX projection_ticket_threads_thread_idx
      ON projection_ticket_threads (thread_id, ticket_id)
  `

  yield* sql`
    CREATE TABLE projection_sessions (
      thread_id TEXT PRIMARY KEY REFERENCES projection_threads(thread_id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      last_error TEXT,
      active_turn_id TEXT,
      runtime_mode TEXT NOT NULL,
      resume_cursor TEXT,
      updated_at TEXT NOT NULL
    )
  `

  yield* sql`
    CREATE TABLE projection_turns (
      turn_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES projection_threads(thread_id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL CHECK (ordinal >= 1),
      state TEXT NOT NULL CHECK (state IN ('running', 'interrupted', 'completed', 'error')),
      requested_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      UNIQUE (thread_id, ordinal)
    )
  `

  yield* sql`
    CREATE INDEX projection_turns_thread_idx
      ON projection_turns (thread_id, ordinal)
  `

  yield* sql`
    CREATE TABLE projection_transcript (
      transcript_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES projection_threads(thread_id) ON DELETE CASCADE,
      turn_id TEXT NOT NULL REFERENCES projection_turns(turn_id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL CHECK (ordinal >= 1),
      kind TEXT NOT NULL,
      item TEXT NOT NULL,
      event_sequence INTEGER NOT NULL,
      UNIQUE (thread_id, ordinal)
    )
  `

  yield* sql`
    CREATE INDEX projection_transcript_thread_idx
      ON projection_transcript (thread_id, ordinal)
  `
})

export default migration
