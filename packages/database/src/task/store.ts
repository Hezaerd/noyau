import { type Receipt, ReceiptResponse } from "@noyau/database/receipt"
import type { TaskCommand } from "@noyau/domain/task/decider"
import { decide } from "@noyau/domain/task/decider"
import { replay } from "@noyau/domain/task/projector"
import { Task, TaskStatus } from "@noyau/protocol/entities/task"
import { TaskEvent } from "@noyau/protocol/events"
import { ActorId, EventId, MissionId, ProjectId, TaskId } from "@noyau/protocol/ids"
import { Crypto, DateTime, Effect, Option, Result, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

const TaskEventJson = Schema.fromJsonString(TaskEvent)
const ReceiptResponseJson = Schema.fromJsonString(ReceiptResponse)
const CriteriaJson = Schema.fromJsonString(Schema.Array(Schema.NonEmptyString))

const decodeTaskEvent = Schema.decodeUnknownEffect(TaskEvent)
const decodeReceiptResponse = Schema.decodeUnknownEffect(ReceiptResponse)
const encodeTaskEventJson = Schema.encodeEffect(TaskEventJson)
const encodeReceiptResponseJson = Schema.encodeEffect(ReceiptResponseJson)
const encodeCriteriaJson = Schema.encodeEffect(CriteriaJson)

const insertReceipt = (sql: SqlClient, commandId: string, response: ReceiptResponse, now: Date) =>
  Effect.gen(function* () {
    const responseJson = yield* encodeReceiptResponseJson(response)
    yield* sql`
      INSERT INTO receipts (command_id, response, created_at)
      VALUES (${commandId}, ${responseJson}::jsonb, ${now})
    `
  })

/** Applique un événement à la projection lecture `tasks`. */
const applyProjection = (sql: SqlClient, command: TaskCommand, event: TaskEvent, now: Date) => {
  switch (event._tag) {
    case "task.created":
      return Effect.gen(function* () {
        const criteria = yield* encodeCriteriaJson(event.acceptanceCriteria)
        yield* sql`
          INSERT INTO tasks (
            id, mission_id, project_id, title, description,
            acceptance_criteria, status, assignee_id, created_at
          ) VALUES (
            ${event.taskId}, ${event.missionId}, ${command.projectId}, ${event.title},
            ${event.description ?? null}, ${criteria}::jsonb, 'proposed', ${null}, ${now}
          )
        `
      })
    case "task.assigned":
      return sql`UPDATE tasks SET assignee_id = ${event.assigneeId} WHERE id = ${event.taskId}`
    case "task.completed":
      return sql`UPDATE tasks SET status = 'completed' WHERE id = ${event.taskId}`
    case "task.failed":
      return sql`UPDATE tasks SET status = 'failed' WHERE id = ${event.taskId}`
  }
}

/**
 * Exécute une commande task selon le flux Noyau : receipt d'idempotence,
 * replay du journal, decider pur, puis dans la même transaction PostgreSQL :
 * événements enveloppés + receipt + projection + outbox.
 *
 * Un rejet du decider est une réponse stable (receipt `rejected`), pas une
 * erreur du canal — un retry de la même commande rend le même receipt.
 */
export const executeTaskCommand = (command: TaskCommand) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient
    const crypto = yield* Crypto.Crypto
    const taskId = command.payload.taskId

    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const receiptRows = yield* sql<{ response: unknown }>`
          SELECT response FROM receipts WHERE command_id = ${command.commandId}
        `
        const existing = receiptRows[0]
        if (existing !== undefined) {
          const response = yield* decodeReceiptResponse(existing.response)
          return { commandId: command.commandId, response } satisfies Receipt
        }

        const eventRows = yield* sql<{ event: unknown }>`
          SELECT event FROM events
          WHERE aggregate_type = 'task' AND aggregate_id = ${taskId}
          ORDER BY sequence ASC
        `
        const history = yield* Effect.forEach(eventRows, (row) => decodeTaskEvent(row.event))
        const decision = decide(replay(history), command)

        const occurredAt = DateTime.toDateUtc(yield* DateTime.now)

        if (Result.isFailure(decision)) {
          const response: ReceiptResponse = { _tag: "rejected", error: decision.failure }
          yield* insertReceipt(sql, command.commandId, response, occurredAt)
          return { commandId: command.commandId, response } satisfies Receipt
        }

        const eventIds: Array<EventId> = []
        for (const event of decision.success) {
          const eventId = EventId.make(yield* Effect.orDie(crypto.randomUUIDv4))
          const eventJson = yield* encodeTaskEventJson(event)
          yield* sql`
            WITH inserted AS (
              INSERT INTO events (
                event_id, project_id, actor_id, correlation_id, causation_id,
                occurred_at, schema_version, aggregate_type, aggregate_id, event
              ) VALUES (
                ${eventId}, ${command.projectId}, ${command.actorId}, ${command.correlationId},
                ${command.commandId}, ${occurredAt}, ${command.schemaVersion}, 'task',
                ${taskId}, ${eventJson}::jsonb
              )
              RETURNING sequence
            )
            INSERT INTO outbox (event_sequence, created_at)
            SELECT sequence, ${occurredAt} FROM inserted
          `
          yield* applyProjection(sql, command, event, occurredAt)
          eventIds.push(eventId)
        }

        const response: ReceiptResponse = { _tag: "accepted", eventIds }
        yield* insertReceipt(sql, command.commandId, response, occurredAt)
        return { commandId: command.commandId, response } satisfies Receipt
      }),
    )
  })

const TaskRow = Schema.Struct({
  id: TaskId,
  mission_id: MissionId,
  project_id: ProjectId,
  title: Schema.NonEmptyString,
  description: Schema.NullOr(Schema.String),
  acceptance_criteria: Schema.Array(Schema.NonEmptyString),
  status: TaskStatus,
  assignee_id: Schema.NullOr(ActorId),
  created_at: Schema.DateTimeUtcFromDate,
})

const decodeTaskRow = Schema.decodeUnknownEffect(TaskRow)

/** Lit la projection `tasks` et la décode en entité `Task` du protocole. */
export const readTask = (taskId: TaskId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient
    const rows = yield* sql`
      SELECT id, mission_id, project_id, title, description,
             acceptance_criteria, status, assignee_id, created_at
      FROM tasks WHERE id = ${taskId}
    `
    const first = rows[0]
    if (first === undefined) {
      return Option.none<Task>()
    }
    const row = yield* decodeTaskRow(first)
    return Option.some(
      Task.make({
        id: row.id,
        missionId: row.mission_id,
        projectId: row.project_id,
        title: row.title,
        acceptanceCriteria: row.acceptance_criteria,
        status: row.status,
        createdAt: row.created_at,
        ...(row.description === null ? {} : { description: row.description }),
        ...(row.assignee_id === null ? {} : { assigneeId: row.assignee_id }),
      }),
    )
  })
