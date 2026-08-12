import { PgliteClient } from "@effect/sql-pglite"
import { assert, describe, layer } from "@effect/vitest"
import { durableCommandJournalMigration, initMigration } from "@noyau/database/migrations"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

describe("migrations", () => {
  layer(PgliteClient.layer({}), { timeout: "30 seconds" })((it) => {
    it.effect("backfill les versions et positions d'un journal existant", () =>
      Effect.gen(function* () {
        yield* initMigration
        const sql = yield* SqlClient
        const firstProject = "aaaaaaaa-0000-4000-8000-000000000101"
        const secondProject = "aaaaaaaa-0000-4000-8000-000000000102"
        const taskId = "bbbbbbbb-0000-4000-8000-000000000101"
        const missionId = "cccccccc-0000-4000-8000-000000000101"

        yield* sql`
          INSERT INTO events (
            event_id, project_id, actor_id, correlation_id, causation_id,
            occurred_at, schema_version, aggregate_type, aggregate_id, event
          ) VALUES
            (
              'dddddddd-0000-4000-8000-000000000101',
              ${firstProject},
              'human:test',
              'eeeeeeee-0000-4000-8000-000000000101',
              'ffffffff-0000-4000-8000-000000000101',
              '2026-08-12T12:00:00.000Z',
              1,
              'task',
              ${taskId},
              '{"_tag":"task.created","taskId":"bbbbbbbb-0000-4000-8000-000000000101","missionId":"cccccccc-0000-4000-8000-000000000101","title":"Historique","acceptanceCriteria":[]}'::jsonb
            ),
            (
              'dddddddd-0000-4000-8000-000000000102',
              ${firstProject},
              'agent:test',
              'eeeeeeee-0000-4000-8000-000000000101',
              'ffffffff-0000-4000-8000-000000000102',
              '2026-08-12T12:01:00.000Z',
              1,
              'task',
              ${taskId},
              '{"_tag":"task.assigned","taskId":"bbbbbbbb-0000-4000-8000-000000000101","assigneeId":"agent:test"}'::jsonb
            )
        `
        yield* sql`
          INSERT INTO tasks (
            id, mission_id, project_id, title, description,
            acceptance_criteria, status, assignee_id, created_at
          ) VALUES (
            ${taskId}, ${missionId}, ${firstProject}, 'Historique', ${null},
            '[]'::jsonb, 'proposed', ${null}, '2026-08-12T12:00:00.000Z'
          )
        `

        yield* durableCommandJournalMigration

        const events = yield* sql<{
          aggregate_version: string
          project_position: string
        }>`
          SELECT
            aggregate_version::text,
            project_position::text
          FROM events
          ORDER BY sequence
        `
        assert.deepStrictEqual(events, [
          { aggregate_version: "1", project_position: "1" },
          { aggregate_version: "2", project_position: "2" },
        ])

        const aggregateHeads = yield* sql<{ version: string }>`
          SELECT version::text
          FROM aggregate_heads
          WHERE project_id = ${firstProject}
            AND aggregate_type = 'task'
            AND aggregate_id = ${taskId}
        `
        const projectHeads = yield* sql<{ position: string }>`
          SELECT position::text
          FROM project_stream_heads
          WHERE project_id = ${firstProject}
        `
        assert.strictEqual(aggregateHeads[0]?.version, "2")
        assert.strictEqual(projectHeads[0]?.position, "2")

        yield* sql`
          INSERT INTO tasks (
            id, mission_id, project_id, title, description,
            acceptance_criteria, status, assignee_id, created_at
          ) VALUES (
            ${taskId}, ${missionId}, ${secondProject}, 'Même id', ${null},
            '[]'::jsonb, 'proposed', ${null}, '2026-08-12T12:00:00.000Z'
          )
        `
        const taskCount = yield* sql<{ total: number }>`
          SELECT count(*)::int AS total
          FROM tasks
          WHERE id = ${taskId}
        `
        assert.strictEqual(taskCount[0]?.total, 2)
      }),
    )
  })
})
