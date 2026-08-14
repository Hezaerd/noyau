import type { TaskCommand } from "@noyau/domain/task/decider"
import { decide } from "@noyau/domain/task/decider"
import { replay } from "@noyau/domain/task/projector"
import {
  TaskAssign,
  TaskCommandRequest,
  TaskComplete,
  TaskCreate,
  TaskFail,
  type TaskCommandRequest as TaskCommandRequestType,
} from "@noyau/protocol/commands"
import { CommandIdConflict, InvalidCausation } from "@noyau/protocol/control-plane"
import { AcceptanceCriteria, Task, TaskStatus } from "@noyau/protocol/entities/task"
import {
  EventEnvelope,
  TaskAssigned,
  TaskCompleted,
  TaskCreated,
  TaskEvent,
  TaskFailed,
} from "@noyau/protocol/events"
import {
  ActorId,
  CommandId,
  CorrelationId,
  EventId,
  MissionId,
  ProjectId,
  TaskId,
} from "@noyau/protocol/ids"
import { type Receipt, ReceiptResponse } from "@noyau/protocol/receipts"
import { Crypto, DateTime, Effect, Option, Result, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

const TaskCommandSchema = Schema.Union([TaskCreate, TaskAssign, TaskComplete, TaskFail])
const InternalTaskCompleteRequest = Schema.TaggedStruct("task.complete", {
  commandId: CommandId,
  causationId: Schema.optionalKey(EventId),
  payload: Schema.Struct({
    taskId: TaskId,
    summary: Schema.optionalKey(Schema.String),
  }),
})
const InternalTaskFailRequest = Schema.TaggedStruct("task.fail", {
  commandId: CommandId,
  causationId: Schema.optionalKey(EventId),
  payload: Schema.Struct({
    taskId: TaskId,
    reason: Schema.NonEmptyString,
  }),
})
const CanonicalTaskRequest = Schema.Union([
  TaskCommandRequest,
  InternalTaskCompleteRequest,
  InternalTaskFailRequest,
])
type CanonicalTaskRequest = (typeof CanonicalTaskRequest)["Type"]

const TaskEventJson = Schema.fromJsonString(TaskEvent)
const TaskCommandJson = Schema.fromJsonString(TaskCommandSchema)
const CanonicalTaskRequestJson = Schema.fromJsonString(CanonicalTaskRequest)
const ReceiptResponseJson = Schema.fromJsonString(ReceiptResponse)
const CriteriaJson = Schema.fromJsonString(AcceptanceCriteria)

const decodeTaskEvent = Schema.decodeUnknownEffect(TaskEvent)
const decodeReceiptResponse = Schema.decodeUnknownEffect(ReceiptResponse)
const encodeTaskEventJson = Schema.encodeEffect(TaskEventJson)
const encodeTaskCommandJson = Schema.encodeEffect(TaskCommandJson)
const encodeCanonicalTaskRequestJson = Schema.encodeEffect(CanonicalTaskRequestJson)
const encodeReceiptResponseJson = Schema.encodeEffect(ReceiptResponseJson)
const encodeCriteriaJson = Schema.encodeEffect(CriteriaJson)

const PresenceRow = Schema.Struct({ present: Schema.Boolean })
const MatchRow = Schema.Struct({ matches: Schema.Boolean })
const ReceiptRow = Schema.Struct({ response: Schema.Unknown })
const VersionRow = Schema.Struct({ version: Schema.BigIntFromString })
const PositionRow = Schema.Struct({ position: Schema.BigIntFromString })
const CorrelationRow = Schema.Struct({ correlation_id: CorrelationId })
const EventPayloadRow = Schema.Struct({ event: Schema.Unknown })

const decodePresenceRow = Schema.decodeUnknownEffect(PresenceRow)
const decodeMatchRow = Schema.decodeUnknownEffect(MatchRow)
const decodeReceiptRow = Schema.decodeUnknownEffect(ReceiptRow)
const decodeVersionRow = Schema.decodeUnknownEffect(VersionRow)
const decodePositionRow = Schema.decodeUnknownEffect(PositionRow)
const decodeCorrelationRow = Schema.decodeUnknownEffect(CorrelationRow)
const decodeEventPayloadRow = Schema.decodeUnknownEffect(EventPayloadRow)

const firstDecoded = <A, Row, E, R>(
  rows: ReadonlyArray<Row>,
  decode: (input: Row) => Effect.Effect<A, E, R>,
) => {
  const first = rows[0]
  return first === undefined
    ? Effect.succeed(Option.none<A>())
    : decode(first).pipe(Effect.map(Option.some))
}

const insertReceipt = (
  sql: SqlClient,
  commandId: CommandId,
  response: ReceiptResponse,
  now: Date,
) =>
  Effect.gen(function* () {
    const responseJson = yield* encodeReceiptResponseJson(response)
    yield* sql`
      INSERT INTO receipts (command_id, response, created_at)
      VALUES (${commandId}, ${responseJson}::jsonb, ${now})
    `
  })

/** Applique un événement à la projection lecture `tasks`. */
const applyProjection = (sql: SqlClient, projectId: ProjectId, event: TaskEvent, now: Date) => {
  switch (event._tag) {
    case "task.created":
      return Effect.gen(function* () {
        const criteria = yield* encodeCriteriaJson(event.acceptanceCriteria)
        yield* sql`
          INSERT INTO tasks (
            id, mission_id, project_id, title, description,
            acceptance_criteria, status, assignee_id, created_at
          ) VALUES (
            ${event.taskId}, ${event.missionId}, ${projectId}, ${event.title},
            ${event.description ?? null}, ${criteria}::jsonb, 'proposed', ${null}, ${now}
          )
        `
      })
    case "task.assigned":
      return sql`
        UPDATE tasks
        SET assignee_id = ${event.assigneeId}
        WHERE project_id = ${projectId} AND id = ${event.taskId}
      `
    case "task.completed":
      return sql`
        UPDATE tasks
        SET status = 'completed'
        WHERE project_id = ${projectId} AND id = ${event.taskId}
      `
    case "task.failed":
      return sql`
        UPDATE tasks
        SET status = 'failed'
        WHERE project_id = ${projectId} AND id = ${event.taskId}
      `
  }
}

const canonicalRequestFromCommand = (command: TaskCommand): CanonicalTaskRequest => {
  const meta = { commandId: command.commandId }
  if (command.causationId !== undefined) {
    Object.assign(meta, { causationId: command.causationId })
  }
  switch (command._tag) {
    case "task.create":
      return { _tag: command._tag, ...meta, payload: command.payload }
    case "task.assign":
      return { _tag: command._tag, ...meta, payload: command.payload }
    case "task.complete":
      return { _tag: command._tag, ...meta, payload: command.payload }
    case "task.fail":
      return { _tag: command._tag, ...meta, payload: command.payload }
  }
}

const eventFromCanonicalRequest = (request: CanonicalTaskRequest): TaskEvent => {
  switch (request._tag) {
    case "task.create":
      return TaskCreated.make(request.payload)
    case "task.assign":
      return TaskAssigned.make(request.payload)
    case "task.complete":
      return TaskCompleted.make(request.payload)
    case "task.fail":
      return TaskFailed.make(request.payload)
  }
}

interface JournaledTaskCommand {
  readonly request: CanonicalTaskRequest
  readonly projectId: ProjectId
  readonly actorId: ActorId
  readonly rootCorrelationId: CorrelationId
  readonly makeCommand: (correlationId: CorrelationId, issuedAt: DateTime.Utc) => TaskCommand
}

const executeJournaledTaskCommand = (input: JournaledTaskCommand) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient
    const crypto = yield* Crypto.Crypto
    const requestJson = yield* encodeCanonicalTaskRequestJson(input.request)
    const taskId = input.request.payload.taskId

    return yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`
          INSERT INTO command_locks (command_id)
          VALUES (${input.request.commandId})
          ON CONFLICT (command_id) DO NOTHING
        `
        yield* sql`
          SELECT command_id
          FROM command_locks
          WHERE command_id = ${input.request.commandId}
          FOR UPDATE
        `

        const presenceRows = yield* sql`
          SELECT EXISTS (
            SELECT 1 FROM commands WHERE command_id = ${input.request.commandId}
          ) AS present
        `
        const presence = yield* decodePresenceRow(presenceRows[0])
        if (presence.present) {
          const matchRows = yield* sql`
            SELECT EXISTS (
              SELECT 1
              FROM commands
              WHERE command_id = ${input.request.commandId}
                AND request = ${requestJson}::jsonb
                AND project_id = ${input.projectId}
                AND actor_id = ${input.actorId}
            ) AS matches
          `
          const match = yield* decodeMatchRow(matchRows[0])
          if (!match.matches) {
            return yield* new CommandIdConflict({ commandId: input.request.commandId })
          }

          const receiptRows = yield* sql`
            SELECT response FROM receipts WHERE command_id = ${input.request.commandId}
          `
          const receiptRow = yield* firstDecoded(receiptRows, decodeReceiptRow)
          if (Option.isNone(receiptRow)) {
            return yield* Effect.die(new Error("Commande journalisée sans receipt"))
          }
          const response = yield* decodeReceiptResponse(receiptRow.value.response)
          return { commandId: input.request.commandId, response } satisfies Receipt
        }

        const legacyReceiptRows = yield* sql`
          SELECT response
          FROM receipts
          WHERE command_id = ${input.request.commandId}
        `
        const legacyReceipt = yield* firstDecoded(legacyReceiptRows, decodeReceiptRow)
        if (Option.isSome(legacyReceipt)) {
          if (input.request.causationId === undefined) {
            const expectedEventJson = yield* encodeTaskEventJson(
              eventFromCanonicalRequest(input.request),
            )
            const legacyMatchRows = yield* sql`
              SELECT EXISTS (
                SELECT 1
                FROM events
                WHERE causation_id = ${input.request.commandId}
                  AND project_id = ${input.projectId}
                  AND actor_id = ${input.actorId}
                  AND correlation_id = ${input.rootCorrelationId}
                  AND event = ${expectedEventJson}::jsonb
              ) AS matches
            `
            const legacyMatch = yield* decodeMatchRow(legacyMatchRows[0])
            if (legacyMatch.matches) {
              const response = yield* decodeReceiptResponse(legacyReceipt.value.response)
              return { commandId: input.request.commandId, response } satisfies Receipt
            }
          }
          return yield* new CommandIdConflict({ commandId: input.request.commandId })
        }

        let correlationId = input.rootCorrelationId
        if (input.request.causationId !== undefined) {
          const correlationRows = yield* sql`
            SELECT correlation_id
            FROM events
            WHERE project_id = ${input.projectId}
              AND event_id = ${input.request.causationId}
          `
          const correlation = yield* firstDecoded(correlationRows, decodeCorrelationRow)
          if (Option.isNone(correlation)) {
            return yield* new InvalidCausation({
              causationId: input.request.causationId,
            })
          }
          correlationId = correlation.value.correlation_id
        }

        const issuedAt = yield* DateTime.now
        const occurredAt = DateTime.toDateUtc(issuedAt)
        const command = input.makeCommand(correlationId, issuedAt)
        const commandJson = yield* encodeTaskCommandJson(command)

        yield* sql`
          INSERT INTO commands (
            command_id, request, project_id, actor_id, command, created_at
          ) VALUES (
            ${command.commandId}, ${requestJson}::jsonb, ${input.projectId},
            ${input.actorId}, ${commandJson}::jsonb, ${occurredAt}
          )
        `

        yield* sql`
          INSERT INTO aggregate_heads (
            project_id, aggregate_type, aggregate_id, version
          ) VALUES (${input.projectId}, 'task', ${taskId}, 0)
          ON CONFLICT (project_id, aggregate_type, aggregate_id) DO NOTHING
        `
        const versionRows = yield* sql`
          SELECT version::text AS version
          FROM aggregate_heads
          WHERE project_id = ${input.projectId}
            AND aggregate_type = 'task'
            AND aggregate_id = ${taskId}
          FOR UPDATE
        `
        const version = yield* decodeVersionRow(versionRows[0])

        const eventRows = yield* sql`
          SELECT event
          FROM events
          WHERE project_id = ${input.projectId}
            AND aggregate_type = 'task'
            AND aggregate_id = ${taskId}
            AND aggregate_version <= ${version.version.toString()}::bigint
          ORDER BY aggregate_version
        `
        const history = yield* Effect.forEach(eventRows, (row) =>
          decodeEventPayloadRow(row).pipe(
            Effect.flatMap((decoded) => decodeTaskEvent(decoded.event)),
          ),
        )
        const decision = decide(replay(history), command)

        if (Result.isFailure(decision)) {
          const response: ReceiptResponse = { _tag: "rejected", error: decision.failure }
          yield* insertReceipt(sql, command.commandId, response, occurredAt)
          return { commandId: command.commandId, response } satisfies Receipt
        }

        yield* sql`
          INSERT INTO project_stream_heads (project_id, position)
          VALUES (${input.projectId}, 0)
          ON CONFLICT (project_id) DO NOTHING
        `
        const positionRows = yield* sql`
          SELECT position::text AS position
          FROM project_stream_heads
          WHERE project_id = ${input.projectId}
          FOR UPDATE
        `
        const position = yield* decodePositionRow(positionRows[0])

        const eventIds: Array<EventId> = []
        for (let index = 0; index < decision.success.length; index++) {
          const event = decision.success[index]
          if (event === undefined) {
            continue
          }
          const eventId = EventId.make(yield* Effect.orDie(crypto.randomUUIDv4))
          const eventJson = yield* encodeTaskEventJson(event)
          const aggregateVersion = version.version + BigInt(index) + 1n
          const projectPosition = position.position + BigInt(index) + 1n
          yield* sql`
            WITH inserted AS (
              INSERT INTO events (
                event_id, project_id, actor_id, correlation_id, causation_id,
                occurred_at, schema_version, aggregate_type, aggregate_id,
                aggregate_version, project_position, event
              ) VALUES (
                ${eventId}, ${command.projectId}, ${command.actorId}, ${command.correlationId},
                ${command.commandId}, ${occurredAt}, ${command.schemaVersion}, 'task',
                ${taskId}, ${aggregateVersion.toString()}::bigint,
                ${projectPosition.toString()}::bigint, ${eventJson}::jsonb
              )
              RETURNING sequence
            )
            INSERT INTO outbox (event_sequence, created_at)
            SELECT sequence, ${occurredAt} FROM inserted
          `
          yield* applyProjection(sql, command.projectId, event, occurredAt)
          eventIds.push(eventId)
        }

        const nextVersion = version.version + BigInt(decision.success.length)
        const nextPosition = position.position + BigInt(decision.success.length)
        yield* sql`
          UPDATE aggregate_heads
          SET version = ${nextVersion.toString()}::bigint
          WHERE project_id = ${input.projectId}
            AND aggregate_type = 'task'
            AND aggregate_id = ${taskId}
        `
        yield* sql`
          UPDATE project_stream_heads
          SET position = ${nextPosition.toString()}::bigint
          WHERE project_id = ${input.projectId}
        `

        const response: ReceiptResponse = { _tag: "accepted", eventIds }
        yield* insertReceipt(sql, command.commandId, response, occurredAt)
        return { commandId: command.commandId, response } satisfies Receipt
      }),
    )
  })

/**
 * Frontière publique : enrichit une request client avec les métadonnées
 * possédées par le control plane, après la vérification d'idempotence.
 */
export const executeTaskCommandRequest = ({
  request,
  projectId,
  actorId,
}: {
  readonly request: TaskCommandRequestType
  readonly projectId: ProjectId
  readonly actorId: ActorId
}) =>
  executeJournaledTaskCommand({
    request,
    projectId,
    actorId,
    rootCorrelationId: CorrelationId.make(request.commandId),
    makeCommand: (correlationId, issuedAt) => {
      const metadata = {
        commandId: request.commandId,
        projectId,
        actorId,
        correlationId,
        issuedAt,
        schemaVersion: 1 as const,
      }
      if (request.causationId !== undefined) {
        Object.assign(metadata, { causationId: request.causationId })
      }
      switch (request._tag) {
        case "task.create":
          return TaskCreate.make({ ...metadata, _tag: request._tag, payload: request.payload })
        case "task.assign":
          return TaskAssign.make({ ...metadata, _tag: request._tag, payload: request.payload })
      }
    },
  })

/**
 * Compatibilité interne pour les commandes déjà enrichies. La commande passe
 * par le même journal, les mêmes verrous et les mêmes versions que la frontière
 * request.
 */
export const executeTaskCommand = (command: TaskCommand) =>
  executeJournaledTaskCommand({
    request: canonicalRequestFromCommand(command),
    projectId: command.projectId,
    actorId: command.actorId,
    rootCorrelationId: command.correlationId,
    makeCommand: (correlationId) => ({ ...command, correlationId }),
  })

const TaskRow = Schema.Struct({
  id: TaskId,
  mission_id: MissionId,
  project_id: ProjectId,
  title: Schema.NonEmptyString,
  description: Schema.NullOr(Schema.String),
  acceptance_criteria: AcceptanceCriteria,
  status: TaskStatus,
  assignee_id: Schema.NullOr(ActorId),
  created_at: Schema.DateTimeUtcFromDate,
})

const decodeTaskRow = Schema.decodeUnknownEffect(TaskRow)

const taskFromRow = (row: (typeof TaskRow)["Type"]) => {
  const task = {
    id: row.id,
    missionId: row.mission_id,
    projectId: row.project_id,
    title: row.title,
    acceptanceCriteria: row.acceptance_criteria,
    status: row.status,
    createdAt: row.created_at,
  }
  if (row.description !== null) {
    Object.assign(task, { description: row.description })
  }
  if (row.assignee_id !== null) {
    Object.assign(task, { assigneeId: row.assignee_id })
  }
  return Task.make(task)
}

/** Lit une tâche dans son projet et décode la projection. */
export const readTask = (projectId: ProjectId, taskId: TaskId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient
    const rows = yield* sql`
      SELECT id, mission_id, project_id, title, description,
             acceptance_criteria, status, assignee_id, created_at
      FROM tasks
      WHERE project_id = ${projectId} AND id = ${taskId}
    `
    const row = yield* firstDecoded(rows, decodeTaskRow)
    return Option.map(row, taskFromRow)
  })

export interface ProjectTaskSnapshot {
  readonly tasks: ReadonlyArray<Task>
  readonly position: bigint
}

/**
 * Lit projection et high-water dans le même snapshot PostgreSQL.
 */
export const readProjectTaskSnapshot = (projectId: ProjectId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`
        const taskRows = yield* sql`
          SELECT id, mission_id, project_id, title, description,
                 acceptance_criteria, status, assignee_id, created_at
          FROM tasks
          WHERE project_id = ${projectId}
          ORDER BY created_at, id
        `
        const tasks = yield* Effect.forEach(taskRows, (row) =>
          decodeTaskRow(row).pipe(Effect.map(taskFromRow)),
        )
        const positionRows = yield* sql`
          SELECT COALESCE(
            (
              SELECT position
              FROM project_stream_heads
              WHERE project_id = ${projectId}
            ),
            0
          )::text AS position
        `
        const position = yield* decodePositionRow(positionRows[0])
        return { tasks, position: position.position }
      }),
    )
  })

const ProjectEventRow = Schema.Struct({
  position: Schema.BigIntFromString,
  envelope: EventEnvelope,
})
const decodeProjectEventRow = Schema.decodeUnknownEffect(ProjectEventRow)

export interface ProjectEvent {
  readonly position: bigint
  readonly event: EventEnvelope
}

/**
 * Lit le journal ordonné d'un projet après une position exclusive.
 */
export const readProjectEvents = (projectId: ProjectId, afterPosition: bigint, limit = 100) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient
    const rows = yield* sql`
      SELECT
        project_position::text AS position,
        jsonb_build_object(
          'eventId', event_id,
          'projectId', project_id,
          'actorId', actor_id,
          'correlationId', correlation_id,
          'causationId', causation_id,
          'occurredAt', occurred_at,
          'schemaVersion', schema_version,
          'event', event
        ) AS envelope
      FROM events
      WHERE project_id = ${projectId}
        AND project_position > ${afterPosition.toString()}::bigint
      ORDER BY project_position
      LIMIT ${limit}
    `
    return yield* Effect.forEach(rows, (row) =>
      decodeProjectEventRow(row).pipe(
        Effect.map((decoded): ProjectEvent => ({
          position: decoded.position,
          event: decoded.envelope,
        })),
      ),
    )
  })

/** Lit le high-water courant d'un projet. */
export const readProjectEventHighWater = (projectId: ProjectId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient
    const rows = yield* sql`
      SELECT COALESCE(
        (
          SELECT position
          FROM project_stream_heads
          WHERE project_id = ${projectId}
        ),
        0
      )::text AS position
    `
    return (yield* decodePositionRow(rows[0])).position
  })
