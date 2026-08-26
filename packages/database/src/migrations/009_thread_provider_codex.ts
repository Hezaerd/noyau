import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

/** SQLite ne droppe pas un CHECK : rebuild pour accepter `codex`. */
const migration = Effect.gen(function* () {
  const sql = yield* SqlClient

  yield* sql`PRAGMA foreign_keys = OFF`

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

  yield* sql`DROP TABLE projection_threads`
  yield* sql`ALTER TABLE projection_threads_new RENAME TO projection_threads`

  yield* sql`
    CREATE INDEX projection_threads_project_idx
      ON projection_threads (project_id, created_at, thread_id)
  `

  yield* sql`PRAGMA foreign_keys = ON`
})

export default migration
