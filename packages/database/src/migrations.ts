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
export const initMigration = Effect.gen(function* () {
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
export const durableCommandJournalMigration = Effect.gen(function* () {
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

/**
 * Projections du modèle Ticket/Kanban. Le journal reste la source de vérité ;
 * ces tables sont reconstruisibles depuis les événements.
 */
export const kanbanTicketMigration = Effect.gen(function* () {
  const sql = yield* SqlClient

  yield* sql`
    CREATE TABLE kanban_columns (
      id uuid NOT NULL,
      project_id uuid NOT NULL,
      name text NOT NULL,
      color text NOT NULL,
      rank text NOT NULL,
      done boolean NOT NULL,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      PRIMARY KEY (project_id, id),
      UNIQUE (project_id, rank),
      CHECK (name <> ''),
      CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
      CHECK (rank <> '')
    )
  `

  yield* sql`
    CREATE UNIQUE INDEX kanban_columns_one_done_per_project
      ON kanban_columns (project_id)
      WHERE done
  `

  yield* sql`
    CREATE TABLE tickets (
      id uuid NOT NULL,
      project_id uuid NOT NULL,
      column_id uuid NOT NULL,
      rank text NOT NULL,
      title text NOT NULL,
      description text,
      priority text NOT NULL,
      due_at timestamptz,
      done boolean NOT NULL,
      archived_at timestamptz,
      last_active_column_id uuid,
      assignee_id text,
      workbench_thread_id uuid NOT NULL,
      source_thread_id uuid,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      PRIMARY KEY (project_id, id),
      UNIQUE (project_id, column_id, rank),
      FOREIGN KEY (project_id, column_id)
        REFERENCES kanban_columns (project_id, id),
      FOREIGN KEY (project_id, last_active_column_id)
        REFERENCES kanban_columns (project_id, id),
      CHECK (title <> ''),
      CHECK (rank <> ''),
      CHECK (priority IN ('none', 'low', 'normal', 'high', 'urgent'))
    )
  `

  yield* sql`
    CREATE INDEX tickets_active_board_idx
      ON tickets (project_id, column_id, rank)
      WHERE archived_at IS NULL
  `

  yield* sql`
    CREATE TABLE ticket_dependencies (
      project_id uuid NOT NULL,
      ticket_id uuid NOT NULL,
      prerequisite_ticket_id uuid NOT NULL,
      created_at timestamptz NOT NULL,
      PRIMARY KEY (project_id, ticket_id, prerequisite_ticket_id),
      FOREIGN KEY (project_id, ticket_id)
        REFERENCES tickets (project_id, id),
      FOREIGN KEY (project_id, prerequisite_ticket_id)
        REFERENCES tickets (project_id, id),
      CHECK (ticket_id <> prerequisite_ticket_id)
    )
  `

  yield* sql`
    CREATE TABLE checklist_items (
      id uuid NOT NULL,
      project_id uuid NOT NULL,
      ticket_id uuid NOT NULL,
      title text NOT NULL,
      completed boolean NOT NULL,
      rank text NOT NULL,
      converted_ticket_id uuid,
      PRIMARY KEY (project_id, id),
      UNIQUE (project_id, ticket_id, rank),
      FOREIGN KEY (project_id, ticket_id)
        REFERENCES tickets (project_id, id),
      FOREIGN KEY (project_id, converted_ticket_id)
        REFERENCES tickets (project_id, id),
      CHECK (title <> ''),
      CHECK (rank <> '')
    )
  `

  yield* sql`
    CREATE TABLE ticket_participants (
      project_id uuid NOT NULL,
      ticket_id uuid NOT NULL,
      actor_id text NOT NULL,
      subscribed boolean NOT NULL,
      PRIMARY KEY (project_id, ticket_id, actor_id),
      FOREIGN KEY (project_id, ticket_id)
        REFERENCES tickets (project_id, id)
    )
  `

  yield* sql`
    CREATE TABLE labels (
      id uuid NOT NULL,
      project_id uuid NOT NULL,
      name text NOT NULL,
      color text NOT NULL,
      native boolean NOT NULL,
      PRIMARY KEY (project_id, id),
      UNIQUE (project_id, name),
      CHECK (name <> ''),
      CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
    )
  `

  yield* sql`
    CREATE TABLE ticket_labels (
      project_id uuid NOT NULL,
      ticket_id uuid NOT NULL,
      label_id uuid NOT NULL,
      PRIMARY KEY (project_id, ticket_id, label_id),
      FOREIGN KEY (project_id, ticket_id)
        REFERENCES tickets (project_id, id),
      FOREIGN KEY (project_id, label_id)
        REFERENCES labels (project_id, id)
    )
  `

  yield* sql`
    CREATE TABLE executions (
      id uuid NOT NULL,
      project_id uuid NOT NULL,
      ticket_id uuid NOT NULL,
      expected_outcome text NOT NULL,
      agent_profile_id uuid NOT NULL,
      max_tokens integer NOT NULL,
      timeout_seconds integer NOT NULL,
      tool_policy jsonb NOT NULL,
      created_at timestamptz NOT NULL,
      PRIMARY KEY (project_id, id),
      FOREIGN KEY (project_id, ticket_id)
        REFERENCES tickets (project_id, id),
      CHECK (expected_outcome <> ''),
      CHECK (max_tokens >= 0),
      CHECK (timeout_seconds > 0)
    )
  `

  yield* sql`
    CREATE TABLE attempts (
      id uuid NOT NULL,
      project_id uuid NOT NULL,
      execution_id uuid NOT NULL,
      attempt_number integer NOT NULL,
      status text NOT NULL,
      primary_run_id uuid,
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      PRIMARY KEY (project_id, id),
      UNIQUE (project_id, execution_id, attempt_number),
      FOREIGN KEY (project_id, execution_id)
        REFERENCES executions (project_id, id),
      CHECK (attempt_number > 0),
      CHECK (
        status IN (
          'pending', 'leased', 'running', 'waiting_human', 'waiting_agent',
          'verifying', 'completed', 'failed', 'cancelled'
        )
      )
    )
  `
})

export const migrations: Migrator.Loader = Migrator.fromRecord({
  "1_init": initMigration,
  "2_durable_command_journal": durableCommandJournalMigration,
  "3_kanban_ticket": kanbanTicketMigration,
})

/** Applique les migrations en attente avec le `SqlClient` du contexte. */
export const runMigrations = Migrator.make({})({ loader: migrations })

/** Layer qui applique les migrations à la construction. */
export const migrationsLayer = Layer.effectDiscard(runMigrations)
