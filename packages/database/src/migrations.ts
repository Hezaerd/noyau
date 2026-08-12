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

/**
 * Ajoute le journal canonique des commandes, les têtes verrouillables et les
 * positions de flux propres à chaque projet. Les versions/positions des
 * événements historiques suivent leur ordre interne `sequence`, uniquement
 * pour obtenir un backfill déterministe lors de la migration.
 */
const durableCommandJournal = Effect.gen(function* () {
  const sql = yield* SqlClient

  yield* sql`
    CREATE TABLE command_locks (
      command_id uuid PRIMARY KEY
    )
  `

  yield* sql`
    CREATE TABLE commands (
      command_id uuid PRIMARY KEY,
      request jsonb NOT NULL,
      project_id uuid NOT NULL,
      actor_id text NOT NULL,
      command jsonb NOT NULL,
      created_at timestamptz NOT NULL
    )
  `

  yield* sql`
    CREATE TABLE aggregate_heads (
      project_id uuid NOT NULL,
      aggregate_type text NOT NULL,
      aggregate_id uuid NOT NULL,
      version bigint NOT NULL,
      PRIMARY KEY (project_id, aggregate_type, aggregate_id)
    )
  `

  yield* sql`
    CREATE TABLE project_stream_heads (
      project_id uuid PRIMARY KEY,
      position bigint NOT NULL
    )
  `

  yield* sql`
    ALTER TABLE events
      ADD COLUMN aggregate_version bigint,
      ADD COLUMN project_position bigint
  `

  yield* sql`
    WITH versions AS (
      SELECT
        sequence,
        row_number() OVER (
          PARTITION BY project_id, aggregate_type, aggregate_id
          ORDER BY sequence
        ) AS aggregate_version,
        row_number() OVER (
          PARTITION BY project_id
          ORDER BY sequence
        ) AS project_position
      FROM events
    )
    UPDATE events
    SET
      aggregate_version = versions.aggregate_version,
      project_position = versions.project_position
    FROM versions
    WHERE events.sequence = versions.sequence
  `

  yield* sql`
    ALTER TABLE events
      ALTER COLUMN aggregate_version SET NOT NULL,
      ALTER COLUMN project_position SET NOT NULL
  `

  yield* sql`
    ALTER TABLE events
      ADD CONSTRAINT events_aggregate_version_unique
        UNIQUE (project_id, aggregate_type, aggregate_id, aggregate_version),
      ADD CONSTRAINT events_project_position_unique
        UNIQUE (project_id, project_position)
  `

  yield* sql`
    INSERT INTO aggregate_heads (
      project_id, aggregate_type, aggregate_id, version
    )
    SELECT
      project_id, aggregate_type, aggregate_id, max(aggregate_version)
    FROM events
    GROUP BY project_id, aggregate_type, aggregate_id
  `

  yield* sql`
    INSERT INTO project_stream_heads (project_id, position)
    SELECT project_id, max(project_position)
    FROM events
    GROUP BY project_id
  `

  yield* sql`
    ALTER TABLE tasks
      DROP CONSTRAINT tasks_pkey,
      ADD CONSTRAINT tasks_pkey PRIMARY KEY (project_id, id)
  `

  yield* sql`
    CREATE INDEX events_project_stream_idx
      ON events (project_id, project_position)
  `

  yield* sql`
    CREATE INDEX events_project_aggregate_idx
      ON events (
        project_id, aggregate_type, aggregate_id, aggregate_version
      )
  `
})

export const migrations: Migrator.Loader = Migrator.fromRecord({
  "1_init": init,
  "2_durable_command_journal": durableCommandJournal,
})

/** Applique les migrations en attente avec le `SqlClient` du contexte. */
export const runMigrations = Migrator.make({})({ loader: migrations })

/** Layer qui applique les migrations à la construction. */
export const migrationsLayer = Layer.effectDiscard(runMigrations)
