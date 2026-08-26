import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

/**
 * Journal append-only, têtes d'agrégat et receipts durables. Les projections
 * métier arrivent dans la slice dédiée et partagent la transaction du worker.
 */
const migration = Effect.gen(function* () {
  const sql = yield* SqlClient

  yield* sql`
    CREATE TABLE aggregate_heads (
      aggregate_kind TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      PRIMARY KEY (aggregate_kind, aggregate_id)
    )
  `

  yield* sql`
    CREATE TABLE events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      causation_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      aggregate_kind TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      aggregate_version INTEGER NOT NULL,
      event TEXT NOT NULL,
      UNIQUE (aggregate_kind, aggregate_id, aggregate_version)
    )
  `

  yield* sql`
    CREATE INDEX events_project_sequence_idx
      ON events (project_id, sequence)
  `

  yield* sql`
    CREATE INDEX events_aggregate_sequence_idx
      ON events (aggregate_kind, aggregate_id, sequence)
  `

  yield* sql`
    CREATE TABLE receipts (
      command_id TEXT PRIMARY KEY,
      aggregate_kind TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      command TEXT NOT NULL,
      response TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `
})

export default migration
