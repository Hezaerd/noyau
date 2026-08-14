import { PgliteClient } from "@effect/sql-pglite"
import { assert, describe, layer } from "@effect/vitest"
import {
  durableCommandJournalMigration,
  initMigration,
  kanbanTicketMigration,
} from "@noyau/database/migrations"
import { Effect, Exit } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

type TicketFixture = {
  readonly id: string
  readonly projectId: string
  readonly columnId: string
  readonly rank: string
  readonly title: string
  readonly workbenchThreadId: string
  readonly sourceThreadId?: string
}

const prepareKanban = (projectId: string, columnId: string) =>
  Effect.gen(function* () {
    yield* kanbanTicketMigration
    const sql = yield* SqlClient
    yield* sql`
      INSERT INTO kanban_columns (
        id, project_id, name, color, rank, done, created_at, updated_at
      ) VALUES (
        ${columnId}, ${projectId}, 'Backlog', '#6D5BD0', 'a0', false,
        '2026-08-13T12:00:00.000Z', '2026-08-13T12:00:00.000Z'
      )
    `
  })

const insertTicket = (fixture: TicketFixture) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient
    yield* sql`
      INSERT INTO tickets (
        id, project_id, column_id, rank, title, priority, done,
        workbench_thread_id, source_thread_id, created_at, updated_at
      ) VALUES (
        ${fixture.id},
        ${fixture.projectId},
        ${fixture.columnId},
        ${fixture.rank},
        ${fixture.title},
        'normal',
        false,
        ${fixture.workbenchThreadId},
        ${fixture.sourceThreadId ?? null},
        '2026-08-13T12:00:00.000Z',
        '2026-08-13T12:00:00.000Z'
      )
    `
  })

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

        yield* kanbanTicketMigration

        const backlogId = "bbbbbbbb-0000-4000-8000-000000000201"
        const doneId = "bbbbbbbb-0000-4000-8000-000000000202"
        yield* sql`
          INSERT INTO kanban_columns (
            id, project_id, name, color, rank, done, created_at, updated_at
          ) VALUES
            (
              ${backlogId}, ${firstProject}, 'Backlog', '#6D5BD0', 'a0', false,
              '2026-08-13T12:00:00.000Z', '2026-08-13T12:00:00.000Z'
            ),
            (
              ${doneId}, ${firstProject}, 'Done', '#10B981', 'a1', true,
              '2026-08-13T12:00:00.000Z', '2026-08-13T12:00:00.000Z'
            ),
            (
              ${doneId}, ${secondProject}, 'Done', '#10B981', 'a0', true,
              '2026-08-13T12:00:00.000Z', '2026-08-13T12:00:00.000Z'
            )
        `

        const duplicateDone = yield* Effect.exit(sql`
          INSERT INTO kanban_columns (
            id, project_id, name, color, rank, done, created_at, updated_at
          ) VALUES (
            'bbbbbbbb-0000-4000-8000-000000000203',
            ${firstProject},
            'Terminé',
            '#059669',
            'a2',
            true,
            '2026-08-13T12:00:00.000Z',
            '2026-08-13T12:00:00.000Z'
          )
        `)
        assert.isTrue(Exit.isFailure(duplicateDone))

        const projectionTables = yield* sql<{ table_name: string }>`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name IN (
              'kanban_columns', 'tickets', 'ticket_dependencies',
              'checklist_items', 'ticket_participants', 'labels',
              'ticket_labels', 'executions', 'attempts'
            )
          ORDER BY table_name
        `
        assert.strictEqual(projectionTables.length, 9)
      }),
    )
  })

  layer(PgliteClient.layer({}), { timeout: "30 seconds" })((it) => {
    it.effect("libère le rang d'un ticket archivé sans dupliquer un rang actif", () =>
      Effect.gen(function* () {
        const projectId = "aaaaaaaa-0000-4000-8000-000000000201"
        const columnId = "bbbbbbbb-0000-4000-8000-000000000201"
        const firstTicketId = "cccccccc-0000-4000-8000-000000000201"
        yield* prepareKanban(projectId, columnId)

        yield* insertTicket({
          id: firstTicketId,
          projectId,
          columnId,
          rank: "a0",
          title: "Premier ticket",
          workbenchThreadId: "dddddddd-0000-4000-8000-000000000201",
        })

        const sql = yield* SqlClient
        yield* sql`
          UPDATE tickets
          SET archived_at = now()
          WHERE project_id = ${projectId}
            AND id = ${firstTicketId}
        `

        const replacement = yield* Effect.exit(
          insertTicket({
            id: "cccccccc-0000-4000-8000-000000000202",
            projectId,
            columnId,
            rank: "a0",
            title: "Ticket remplaçant",
            workbenchThreadId: "dddddddd-0000-4000-8000-000000000202",
          }),
        )
        assert.isTrue(Exit.isSuccess(replacement))

        const duplicateActiveRank = yield* Effect.exit(
          insertTicket({
            id: "cccccccc-0000-4000-8000-000000000203",
            projectId,
            columnId,
            rank: "a0",
            title: "Rang actif dupliqué",
            workbenchThreadId: "dddddddd-0000-4000-8000-000000000203",
          }),
        )
        assert.isTrue(Exit.isFailure(duplicateActiveRank))
      }),
    )
  })

  layer(PgliteClient.layer({}), { timeout: "30 seconds" })((it) => {
    it.effect("refuse un Workbench partagé par deux tickets du même projet", () =>
      Effect.gen(function* () {
        const projectId = "aaaaaaaa-0000-4000-8000-000000000301"
        const columnId = "bbbbbbbb-0000-4000-8000-000000000301"
        const workbenchThreadId = "dddddddd-0000-4000-8000-000000000301"
        yield* prepareKanban(projectId, columnId)

        yield* insertTicket({
          id: "cccccccc-0000-4000-8000-000000000301",
          projectId,
          columnId,
          rank: "a0",
          title: "Premier Workbench",
          workbenchThreadId,
        })

        const duplicateWorkbench = yield* Effect.exit(
          insertTicket({
            id: "cccccccc-0000-4000-8000-000000000302",
            projectId,
            columnId,
            rank: "a1",
            title: "Workbench dupliqué",
            workbenchThreadId,
          }),
        )
        assert.isTrue(Exit.isFailure(duplicateWorkbench))
      }),
    )
  })

  layer(PgliteClient.layer({}), { timeout: "30 seconds" })((it) => {
    it.effect("refuse un thread source identique au Workbench", () =>
      Effect.gen(function* () {
        const projectId = "aaaaaaaa-0000-4000-8000-000000000401"
        const columnId = "bbbbbbbb-0000-4000-8000-000000000401"
        const workbenchThreadId = "dddddddd-0000-4000-8000-000000000401"
        yield* prepareKanban(projectId, columnId)

        const sameSourceAndWorkbench = yield* Effect.exit(
          insertTicket({
            id: "cccccccc-0000-4000-8000-000000000401",
            projectId,
            columnId,
            rank: "a0",
            title: "Source invalide",
            workbenchThreadId,
            sourceThreadId: workbenchThreadId,
          }),
        )
        assert.isTrue(Exit.isFailure(sameSourceAndWorkbench))
      }),
    )
  })

  layer(PgliteClient.layer({}), { timeout: "30 seconds" })((it) => {
    it.effect("accepte un thread source distinct du Workbench", () =>
      Effect.gen(function* () {
        const projectId = "aaaaaaaa-0000-4000-8000-000000000501"
        const columnId = "bbbbbbbb-0000-4000-8000-000000000501"
        yield* prepareKanban(projectId, columnId)

        const distinctSourceAndWorkbench = yield* Effect.exit(
          insertTicket({
            id: "cccccccc-0000-4000-8000-000000000501",
            projectId,
            columnId,
            rank: "a0",
            title: "Source valide",
            workbenchThreadId: "dddddddd-0000-4000-8000-000000000501",
            sourceThreadId: "eeeeeeee-0000-4000-8000-000000000501",
          }),
        )
        assert.isTrue(Exit.isSuccess(distinctSourceAndWorkbench))
      }),
    )
  })
})
