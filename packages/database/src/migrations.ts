import { Effect, Layer } from "effect"
import * as Migrator from "effect/unstable/sql/Migrator"
import { SqlClient } from "effect/unstable/sql/SqlClient"

/**
 * Migration initiale : journal d'événements append-only, receipts
 * d'idempotence, outbox transactionnelle et projection `tasks`.
 *
 * `occurred_at`/`created_at` sont fournis par l'application (horloge Effect,
 * testable via TestClock) — pas de `DEFAULT now()`.
 */
const init = Effect.gen(function* () {
  const sql = yield* SqlClient

  yield* sql`
    CREATE TABLE events (
      sequence bigserial PRIMARY KEY,
      event_id uuid NOT NULL UNIQUE,
      project_id uuid NOT NULL,
      actor_id text NOT NULL,
      correlation_id uuid NOT NULL,
      causation_id uuid NOT NULL,
      occurred_at timestamptz NOT NULL,
      schema_version integer NOT NULL,
      aggregate_type text NOT NULL,
      aggregate_id uuid NOT NULL,
      event jsonb NOT NULL
    )
  `

  yield* sql`
    CREATE INDEX events_aggregate_idx
      ON events (aggregate_type, aggregate_id, sequence)
  `

  yield* sql`
    CREATE TABLE receipts (
      command_id uuid PRIMARY KEY,
      response jsonb NOT NULL,
      created_at timestamptz NOT NULL
    )
  `

  yield* sql`
    CREATE TABLE outbox (
      id bigserial PRIMARY KEY,
      event_sequence bigint NOT NULL REFERENCES events (sequence),
      created_at timestamptz NOT NULL,
      processed_at timestamptz
    )
  `

  yield* sql`
    CREATE TABLE tasks (
      id uuid PRIMARY KEY,
      mission_id uuid NOT NULL,
      project_id uuid NOT NULL,
      title text NOT NULL,
      description text,
      acceptance_criteria jsonb NOT NULL,
      status text NOT NULL,
      assignee_id text,
      created_at timestamptz NOT NULL
    )
  `
})

export const migrations: Migrator.Loader = Migrator.fromRecord({
  "1_init": init,
})

/** Applique les migrations en attente avec le `SqlClient` du contexte. */
export const runMigrations = Migrator.make({})({ loader: migrations })

/** Layer qui applique les migrations à la construction. */
export const migrationsLayer = Layer.effectDiscard(runMigrations)
