import { decide } from "@noyau/domain/board/decider"
import { replay } from "@noyau/domain/board/projector"
import { BoardSnapshot, EventCursor } from "@noyau/protocol/board"
import { CommandIdConflict, InvalidCausation } from "@noyau/protocol/control-plane"
import { Execution, ToolPolicy } from "@noyau/protocol/entities/execution"
import { KanbanColumn } from "@noyau/protocol/entities/kanban-column"
import { Ticket } from "@noyau/protocol/entities/ticket"
import type { ActorId, ProjectId, TicketId } from "@noyau/protocol/ids"
import { CommandId, CorrelationId, EventId, KanbanColumnId } from "@noyau/protocol/ids"
import { type TicketReceipt, TicketReceiptResponse } from "@noyau/protocol/receipts"
import {
  TicketCommand,
  TicketCommandRequest,
  type TicketCommandRequest as TicketCommandRequestType,
} from "@noyau/protocol/ticket/commands"
import { TicketEvent } from "@noyau/protocol/ticket/events"
import { Crypto, DateTime, Effect, Option, Result, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

const BoardInitializeRequest = Schema.TaggedStruct("board.initialize", {
  commandId: CommandId,
  causationId: Schema.optionalKey(EventId),
  payload: Schema.Struct({
    backlogColumnId: KanbanColumnId,
    activeColumnId: KanbanColumnId,
    doneColumnId: KanbanColumnId,
  }),
})
type BoardInitializeRequest = (typeof BoardInitializeRequest)["Type"]

const CanonicalBoardRequest = Schema.Union([TicketCommandRequest, BoardInitializeRequest])
type CanonicalBoardRequest = (typeof CanonicalBoardRequest)["Type"]

const TicketEventJson = Schema.fromJsonString(TicketEvent)
const TicketCommandJson = Schema.fromJsonString(TicketCommand)
const CanonicalBoardRequestJson = Schema.fromJsonString(CanonicalBoardRequest)
const TicketReceiptResponseJson = Schema.fromJsonString(TicketReceiptResponse)
const ToolPolicyJson = Schema.fromJsonString(ToolPolicy)

const decodeTicketEvent = Schema.decodeUnknownEffect(TicketEvent)
const decodeTicketCommand = Schema.decodeUnknownEffect(TicketCommand)
const decodeTicketReceiptResponse = Schema.decodeUnknownEffect(TicketReceiptResponse)
const decodeKanbanColumn = Schema.decodeUnknownEffect(KanbanColumn)
const decodeTicket = Schema.decodeUnknownEffect(Ticket)
const decodeExecution = Schema.decodeUnknownEffect(Execution)
const encodeCanonicalBoardRequest = Schema.encodeEffect(CanonicalBoardRequest)
const encodeTicketEventJson = Schema.encodeEffect(TicketEventJson)
const encodeTicketCommandJson = Schema.encodeEffect(TicketCommandJson)
const encodeCanonicalBoardRequestJson = Schema.encodeEffect(CanonicalBoardRequestJson)
const encodeTicketReceiptResponseJson = Schema.encodeEffect(TicketReceiptResponseJson)
const encodeToolPolicyJson = Schema.encodeEffect(ToolPolicyJson)

const PresenceRow = Schema.Struct({ present: Schema.Boolean })
const MatchRow = Schema.Struct({ matches: Schema.Boolean })
const ReceiptRow = Schema.Struct({ response: Schema.Unknown })
const VersionRow = Schema.Struct({ version: Schema.BigIntFromString })
const PositionRow = Schema.Struct({ position: Schema.BigIntFromString })
const CorrelationRow = Schema.Struct({ correlation_id: CorrelationId })
const EventPayloadRow = Schema.Struct({ event: Schema.Unknown })
const EntityRow = Schema.Struct({ entity: Schema.Unknown })

const decodePresenceRow = Schema.decodeUnknownEffect(PresenceRow)
const decodeMatchRow = Schema.decodeUnknownEffect(MatchRow)
const decodeReceiptRow = Schema.decodeUnknownEffect(ReceiptRow)
const decodeVersionRow = Schema.decodeUnknownEffect(VersionRow)
const decodePositionRow = Schema.decodeUnknownEffect(PositionRow)
const decodeCorrelationRow = Schema.decodeUnknownEffect(CorrelationRow)
const decodeEventPayloadRow = Schema.decodeUnknownEffect(EventPayloadRow)
const decodeEntityRow = Schema.decodeUnknownEffect(EntityRow)

const firstDecoded = <A, I, R>(
  rows: ReadonlyArray<unknown>,
  decode: (input: unknown) => Effect.Effect<A, I, R>,
) => {
  const first = rows[0]
  return first === undefined
    ? Effect.succeed(Option.none<A>())
    : decode(first).pipe(Effect.map(Option.some))
}

const insertReceipt = (
  sql: SqlClient,
  commandId: CommandId,
  response: TicketReceiptResponse,
  now: Date,
) =>
  Effect.gen(function* () {
    const responseJson = yield* encodeTicketReceiptResponseJson(response)
    yield* sql`
      INSERT INTO receipts (command_id, response, created_at)
      VALUES (${commandId}, ${responseJson}::jsonb, ${now})
    `
  })

const applyProjection = (sql: SqlClient, projectId: ProjectId, event: TicketEvent, now: Date) => {
  switch (event._tag) {
    case "kanbanColumn.created":
      return sql`
        INSERT INTO kanban_columns (
          id, project_id, name, color, rank, done, created_at, updated_at
        ) VALUES (
          ${event.columnId}, ${projectId}, ${event.name}, ${event.color},
          ${event.rank}, ${event.done}, ${now}, ${now}
        )
      `
    case "kanbanColumn.updated":
      return Effect.gen(function* () {
        if (event.name !== undefined) {
          yield* sql`
            UPDATE kanban_columns
            SET name = ${event.name}
            WHERE project_id = ${projectId} AND id = ${event.columnId}
          `
        }
        if (event.color !== undefined) {
          yield* sql`
            UPDATE kanban_columns
            SET color = ${event.color}
            WHERE project_id = ${projectId} AND id = ${event.columnId}
          `
        }
        yield* sql`
          UPDATE kanban_columns
          SET updated_at = ${now}
          WHERE project_id = ${projectId} AND id = ${event.columnId}
        `
      })
    case "kanbanColumn.moved":
      return sql`
        UPDATE kanban_columns
        SET rank = ${event.rank}, updated_at = ${now}
        WHERE project_id = ${projectId} AND id = ${event.columnId}
      `
    case "kanbanColumn.deleted":
      return Effect.gen(function* () {
        if (event.destinationColumnId !== undefined) {
          yield* sql`
            UPDATE tickets
            SET column_id = ${event.destinationColumnId}, updated_at = ${now}
            WHERE project_id = ${projectId}
              AND column_id = ${event.columnId}
              AND archived_at IS NOT NULL
          `
          yield* sql`
            UPDATE tickets
            SET last_active_column_id = ${event.destinationColumnId}, updated_at = ${now}
            WHERE project_id = ${projectId}
              AND last_active_column_id = ${event.columnId}
          `
        }
        yield* sql`
          DELETE FROM kanban_columns
          WHERE project_id = ${projectId} AND id = ${event.columnId}
        `
      })
    case "ticket.created":
      return sql`
        INSERT INTO tickets (
          id, project_id, column_id, rank, title, description, priority, due_at,
          done, archived_at, last_active_column_id, assignee_id,
          workbench_thread_id, source_thread_id, created_at, updated_at
        ) VALUES (
          ${event.ticketId}, ${projectId}, ${event.columnId}, ${event.rank},
          ${event.title}, ${null}, 'none', ${null}, false, ${null}, ${null}, ${null},
          ${event.workbenchThreadId}, ${event.sourceThreadId ?? null}, ${now}, ${now}
        )
      `
    case "ticket.moved":
      return sql`
        UPDATE tickets
        SET column_id = ${event.columnId}, rank = ${event.rank}, updated_at = ${now}
        WHERE project_id = ${projectId} AND id = ${event.ticketId}
      `
    case "ticket.completed":
      return sql`
        UPDATE tickets
        SET column_id = ${event.doneColumnId}, rank = ${event.rank}, done = true,
            last_active_column_id = ${event.previousColumnId}, updated_at = ${now}
        WHERE project_id = ${projectId} AND id = ${event.ticketId}
      `
    case "ticket.reopened":
      return sql`
        UPDATE tickets
        SET column_id = ${event.columnId}, rank = ${event.rank}, done = false,
            updated_at = ${now}
        WHERE project_id = ${projectId} AND id = ${event.ticketId}
      `
    case "ticket.archived":
      return sql`
        UPDATE tickets
        SET archived_at = ${now}, updated_at = ${now}
        WHERE project_id = ${projectId} AND id = ${event.ticketId}
      `
    case "ticket.restored":
      return sql`
        UPDATE tickets
        SET column_id = ${event.columnId}, rank = ${event.rank}, archived_at = ${null},
            updated_at = ${now}
        WHERE project_id = ${projectId} AND id = ${event.ticketId}
      `
    case "ticket.assigned":
      return sql`
        UPDATE tickets
        SET assignee_id = ${event.assigneeId ?? null}, updated_at = ${now}
        WHERE project_id = ${projectId} AND id = ${event.ticketId}
      `
    case "ticket.updated":
      return Effect.gen(function* () {
        if (event.title !== undefined) {
          yield* sql`
            UPDATE tickets
            SET title = ${event.title}
            WHERE project_id = ${projectId} AND id = ${event.ticketId}
          `
        }
        if (event.description !== undefined) {
          yield* sql`
            UPDATE tickets
            SET description = ${event.description}
            WHERE project_id = ${projectId} AND id = ${event.ticketId}
          `
        }
        if (event.priority !== undefined) {
          yield* sql`
            UPDATE tickets
            SET priority = ${event.priority}
            WHERE project_id = ${projectId} AND id = ${event.ticketId}
          `
        }
        if (event.dueAt !== undefined) {
          yield* sql`
            UPDATE tickets
            SET due_at = ${event.dueAt === null ? null : DateTime.toDateUtc(event.dueAt)}
            WHERE project_id = ${projectId} AND id = ${event.ticketId}
          `
        }
        yield* sql`
          UPDATE tickets
          SET updated_at = ${now}
          WHERE project_id = ${projectId} AND id = ${event.ticketId}
        `
      })
    case "ticket.dependency.added":
      return sql`
        INSERT INTO ticket_dependencies (
          project_id, ticket_id, prerequisite_ticket_id, created_at
        ) VALUES (
          ${projectId}, ${event.ticketId}, ${event.dependsOnTicketId}, ${now}
        )
      `
    case "ticket.dependency.removed":
      return sql`
        DELETE FROM ticket_dependencies
        WHERE project_id = ${projectId}
          AND ticket_id = ${event.ticketId}
          AND prerequisite_ticket_id = ${event.dependsOnTicketId}
      `
    case "execution.started":
      return Effect.gen(function* () {
        const toolPolicy = yield* encodeToolPolicyJson(event.toolPolicy)
        yield* sql`
          INSERT INTO executions (
            id, project_id, ticket_id, expected_outcome, agent_profile_id,
            max_tokens, timeout_seconds, tool_policy, created_at
          ) VALUES (
            ${event.executionId}, ${projectId}, ${event.ticketId},
            ${event.expectedOutcome}, ${event.agentProfileId},
            ${event.budget.maxTokens}, ${event.budget.timeoutSeconds},
            ${toolPolicy}::jsonb, ${now}
          )
        `
      })
    case "execution.completed":
    case "execution.failed":
    case "execution.cancelled":
    case "execution.interrupted":
    case "attempt.created":
    case "attempt.leased":
    case "attempt.started":
    case "attempt.waitingHuman":
    case "attempt.waitingAgent":
    case "attempt.verifying":
    case "attempt.completed":
    case "attempt.failed":
    case "attempt.cancelled":
      return Effect.void
  }
}

interface JournaledBoardCommand {
  readonly request: CanonicalBoardRequest
  readonly projectId: ProjectId
  readonly actorId: ActorId
}

const executeJournaledBoardCommand = ({ request, projectId, actorId }: JournaledBoardCommand) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient
    const crypto = yield* Crypto.Crypto
    const requestJson = yield* encodeCanonicalBoardRequestJson(request)

    return yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`
          INSERT INTO command_locks (command_id)
          VALUES (${request.commandId})
          ON CONFLICT (command_id) DO NOTHING
        `
        yield* sql`
          SELECT command_id
          FROM command_locks
          WHERE command_id = ${request.commandId}
          FOR UPDATE
        `

        const presenceRows = yield* sql`
          SELECT EXISTS (
            SELECT 1 FROM commands WHERE command_id = ${request.commandId}
          ) AS present
        `
        const presence = yield* decodePresenceRow(presenceRows[0])
        if (presence.present) {
          const matchRows = yield* sql`
            SELECT EXISTS (
              SELECT 1
              FROM commands
              WHERE command_id = ${request.commandId}
                AND request = ${requestJson}::jsonb
                AND project_id = ${projectId}
                AND actor_id = ${actorId}
            ) AS matches
          `
          const match = yield* decodeMatchRow(matchRows[0])
          if (!match.matches) {
            return yield* new CommandIdConflict({ commandId: request.commandId })
          }

          const receiptRows = yield* sql`
            SELECT response FROM receipts WHERE command_id = ${request.commandId}
          `
          const receiptRow = yield* firstDecoded(receiptRows, decodeReceiptRow)
          if (Option.isNone(receiptRow)) {
            return yield* Effect.die(new Error("Commande journalisée sans receipt"))
          }
          const response = yield* decodeTicketReceiptResponse(receiptRow.value.response)
          return { commandId: request.commandId, response } satisfies TicketReceipt
        }

        const legacyReceiptRows = yield* sql`
          SELECT response FROM receipts WHERE command_id = ${request.commandId}
        `
        if (legacyReceiptRows.length > 0) {
          return yield* new CommandIdConflict({ commandId: request.commandId })
        }

        let correlationId = CorrelationId.make(request.commandId)
        if (request.causationId !== undefined) {
          const correlationRows = yield* sql`
            SELECT correlation_id
            FROM events
            WHERE project_id = ${projectId}
              AND event_id = ${request.causationId}
          `
          const correlation = yield* firstDecoded(correlationRows, decodeCorrelationRow)
          if (Option.isNone(correlation)) {
            return yield* new InvalidCausation({ causationId: request.causationId })
          }
          correlationId = correlation.value.correlation_id
        }

        const issuedAt = yield* DateTime.now
        const occurredAt = DateTime.toDateUtc(issuedAt)
        const encodedRequest = yield* encodeCanonicalBoardRequest(request)
        const command = yield* decodeTicketCommand({
          ...encodedRequest,
          projectId,
          actorId,
          correlationId,
          issuedAt: DateTime.formatIso(issuedAt),
          schemaVersion: 1,
        })
        const commandJson = yield* encodeTicketCommandJson(command)

        yield* sql`
          INSERT INTO commands (
            command_id, request, project_id, actor_id, command, created_at
          ) VALUES (
            ${command.commandId}, ${requestJson}::jsonb, ${projectId},
            ${actorId}, ${commandJson}::jsonb, ${occurredAt}
          )
        `

        yield* sql`
          INSERT INTO aggregate_heads (
            project_id, aggregate_type, aggregate_id, version
          ) VALUES (${projectId}, 'board', ${projectId}, 0)
          ON CONFLICT (project_id, aggregate_type, aggregate_id) DO NOTHING
        `
        const versionRows = yield* sql`
          SELECT version::text AS version
          FROM aggregate_heads
          WHERE project_id = ${projectId}
            AND aggregate_type = 'board'
            AND aggregate_id = ${projectId}
          FOR UPDATE
        `
        const version = yield* decodeVersionRow(versionRows[0])

        const eventRows = yield* sql`
          SELECT event
          FROM events
          WHERE project_id = ${projectId}
            AND aggregate_type = 'board'
            AND aggregate_id = ${projectId}
            AND aggregate_version <= ${version.version.toString()}::bigint
          ORDER BY aggregate_version
        `
        const history = yield* Effect.forEach(eventRows, (row) =>
          decodeEventPayloadRow(row).pipe(
            Effect.flatMap((decoded) => decodeTicketEvent(decoded.event)),
          ),
        )
        const decision = decide(replay(history), command)

        if (Result.isFailure(decision)) {
          const response: TicketReceiptResponse = {
            _tag: "rejected",
            error: decision.failure,
          }
          yield* insertReceipt(sql, command.commandId, response, occurredAt)
          return { commandId: command.commandId, response } satisfies TicketReceipt
        }

        yield* sql`
          INSERT INTO project_stream_heads (project_id, position)
          VALUES (${projectId}, 0)
          ON CONFLICT (project_id) DO NOTHING
        `
        const positionRows = yield* sql`
          SELECT position::text AS position
          FROM project_stream_heads
          WHERE project_id = ${projectId}
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
          const eventJson = yield* encodeTicketEventJson(event)
          const aggregateVersion = version.version + BigInt(index) + 1n
          const projectPosition = position.position + BigInt(index) + 1n
          yield* sql`
            WITH inserted AS (
              INSERT INTO events (
                event_id, project_id, actor_id, correlation_id, causation_id,
                occurred_at, schema_version, aggregate_type, aggregate_id,
                aggregate_version, project_position, event
              ) VALUES (
                ${eventId}, ${projectId}, ${actorId}, ${correlationId},
                ${command.commandId}, ${occurredAt}, ${command.schemaVersion}, 'board',
                ${projectId}, ${aggregateVersion.toString()}::bigint,
                ${projectPosition.toString()}::bigint, ${eventJson}::jsonb
              )
              RETURNING sequence
            )
            INSERT INTO outbox (event_sequence, created_at)
            SELECT sequence, ${occurredAt} FROM inserted
          `
          yield* applyProjection(sql, projectId, event, occurredAt)
          eventIds.push(eventId)
        }

        const nextVersion = version.version + BigInt(decision.success.length)
        const nextPosition = position.position + BigInt(decision.success.length)
        yield* sql`
          UPDATE aggregate_heads
          SET version = ${nextVersion.toString()}::bigint
          WHERE project_id = ${projectId}
            AND aggregate_type = 'board'
            AND aggregate_id = ${projectId}
        `
        yield* sql`
          UPDATE project_stream_heads
          SET position = ${nextPosition.toString()}::bigint
          WHERE project_id = ${projectId}
        `

        const response: TicketReceiptResponse = { _tag: "accepted", eventIds }
        yield* insertReceipt(sql, command.commandId, response, occurredAt)
        return { commandId: command.commandId, response } satisfies TicketReceipt
      }),
    )
  })

/** Exécute une request Ticket publique dans la transaction durable du Tableau. */
export const executeTicketCommandRequest = ({
  request,
  projectId,
  actorId,
}: {
  readonly request: TicketCommandRequestType
  readonly projectId: ProjectId
  readonly actorId: ActorId
}) => executeJournaledBoardCommand({ request, projectId, actorId })

export interface BoardInitializeInput {
  readonly commandId: CommandId
  readonly projectId: ProjectId
  readonly actorId: ActorId
  readonly backlogColumnId: KanbanColumnId
  readonly activeColumnId: KanbanColumnId
  readonly doneColumnId: KanbanColumnId
  readonly causationId?: EventId
}

/** Initialise les trois colonnes système d'un projet via le même journal durable. */
export const executeBoardInitialize = (input: BoardInitializeInput) =>
  executeJournaledBoardCommand({
    request: BoardInitializeRequest.make({
      commandId: input.commandId,
      payload: {
        backlogColumnId: input.backlogColumnId,
        activeColumnId: input.activeColumnId,
        doneColumnId: input.doneColumnId,
      },
      ...(input.causationId === undefined ? {} : { causationId: input.causationId }),
    }),
    projectId: input.projectId,
    actorId: input.actorId,
  })

/** Lit le Tableau et son curseur dans un snapshot PostgreSQL cohérent. */
export const readProjectBoardSnapshot = (projectId: ProjectId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`
        const columnRows = yield* sql`
          SELECT jsonb_build_object(
            'id', id,
            'projectId', project_id,
            'name', name,
            'color', color,
            'rank', rank,
            'done', done,
            'createdAt', created_at,
            'updatedAt', updated_at
          ) AS entity
          FROM kanban_columns
          WHERE project_id = ${projectId}
          ORDER BY rank, id
        `
        const columns = yield* Effect.forEach(columnRows, (row) =>
          decodeEntityRow(row).pipe(
            Effect.flatMap((decoded) => decodeKanbanColumn(decoded.entity)),
          ),
        )

        const ticketRows = yield* sql`
          SELECT jsonb_strip_nulls(jsonb_build_object(
            'id', id,
            'projectId', project_id,
            'columnId', column_id,
            'rank', rank,
            'title', title,
            'description', description,
            'priority', priority,
            'dueAt', due_at,
            'done', done,
            'archivedAt', archived_at,
            'lastActiveColumnId', last_active_column_id,
            'assigneeId', assignee_id,
            'participantIds', jsonb_build_array(),
            'labelIds', jsonb_build_array(),
            'checklist', jsonb_build_array(),
            'attachmentIds', jsonb_build_array(),
            'workbenchThreadId', workbench_thread_id,
            'sourceThreadId', source_thread_id,
            'createdAt', created_at,
            'updatedAt', updated_at
          )) AS entity
          FROM tickets
          WHERE project_id = ${projectId}
          ORDER BY column_id, rank, id
        `
        const tickets = yield* Effect.forEach(ticketRows, (row) =>
          decodeEntityRow(row).pipe(Effect.flatMap((decoded) => decodeTicket(decoded.entity))),
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
        const position = (yield* decodePositionRow(positionRows[0])).position
        return BoardSnapshot.make({
          projectId,
          columns,
          tickets,
          cursor: EventCursor.make(`v1.${projectId}.${position}`),
        })
      }),
    )
  })

/** Charge les intentions agent d'un ticket séparément du snapshot compact du Tableau. */
export const readTicketExecutions = (projectId: ProjectId, ticketId: TicketId) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient
    const rows = yield* sql`
      SELECT jsonb_build_object(
        'id', id,
        'ticketId', ticket_id,
        'projectId', project_id,
        'expectedOutcome', expected_outcome,
        'agentProfileId', agent_profile_id,
        'budget', jsonb_build_object(
          'maxTokens', max_tokens,
          'timeoutSeconds', timeout_seconds
        ),
        'toolPolicy', tool_policy,
        'createdAt', created_at
      ) AS entity
      FROM executions
      WHERE project_id = ${projectId} AND ticket_id = ${ticketId}
      ORDER BY created_at, id
    `

    return yield* Effect.forEach(rows, (row) =>
      decodeEntityRow(row).pipe(
        Effect.flatMap((decoded) => decodeExecution(decoded.entity)),
      ),
    )
  })
