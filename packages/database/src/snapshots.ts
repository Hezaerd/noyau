import { BoardSnapshot, TICKET_ACTIVITY_LIMIT } from "@noyau/protocol/board"
import { Environment } from "@noyau/protocol/entities/environment"
import type { ModelSelection } from "@noyau/protocol/entities/model-selection"
import { ResumeCursor } from "@noyau/protocol/entities/session"
import { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import { TranscriptItem } from "@noyau/protocol/entities/transcript"
import type { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { ShellSnapshot } from "@noyau/protocol/shell"
import { Effect, Option, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

const SequenceRow = Schema.Struct({ sequence: Schema.Int })
const ProjectRow = Schema.Struct({
  project_id: Schema.String,
  name: Schema.String,
  workspace_root: Schema.String,
  available: Schema.Int,
  created_at: Schema.String,
  updated_at: Schema.String,
})
const ColumnRow = Schema.Struct({
  column_id: Schema.String,
  project_id: Schema.String,
  name: Schema.String,
  color: Schema.String,
  rank: Schema.String,
  done: Schema.Int,
  created_at: Schema.String,
  updated_at: Schema.String,
})
const TicketRow = Schema.Struct({
  ticket_id: Schema.String,
  project_id: Schema.String,
  column_id: Schema.String,
  rank: Schema.String,
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  priority: Schema.String,
  due_at: Schema.NullOr(Schema.String),
  done: Schema.Int,
  archived_at: Schema.NullOr(Schema.String),
  last_active_column_id: Schema.NullOr(Schema.String),
  assignee_id: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
})
const DependencyRow = Schema.Struct({
  ticket_id: Schema.String,
  depends_on_ticket_id: Schema.String,
})
const TicketThreadRow = Schema.Struct({
  ticket_id: Schema.String,
  thread_id: Schema.String,
})
const TicketActivityRow = Schema.Struct({
  ticket_id: Schema.String,
  event_id: Schema.String,
  sequence: Schema.Int,
  project_id: Schema.String,
  actor_id: Schema.String,
  correlation_id: Schema.String,
  causation_id: Schema.String,
  occurred_at: Schema.String,
  schema_version: Schema.Int,
  event: Schema.String,
})
const ThreadRow = Schema.Struct({
  thread_id: Schema.String,
  project_id: Schema.String,
  title: Schema.String,
  provider: Schema.String,
  runtime_mode: Schema.String,
  model_id: Schema.NullOr(Schema.String),
  reasoning_effort: Schema.NullOr(Schema.String),
  service_tier: Schema.NullOr(Schema.String),
  thinking: Schema.NullOr(Schema.Int),
  status: Schema.String,
  created_at: Schema.String,
  updated_at: Schema.String,
  archived_at: Schema.NullOr(Schema.String),
})
const SessionRow = Schema.Struct({
  thread_id: Schema.String,
  status: Schema.String,
  last_error: Schema.NullOr(Schema.String),
  active_turn_id: Schema.NullOr(Schema.String),
  runtime_mode: Schema.String,
  resume_cursor: Schema.NullOr(Schema.String),
  updated_at: Schema.String,
})
const TurnRow = Schema.Struct({
  turn_id: Schema.String,
  thread_id: Schema.String,
  ordinal: Schema.Int,
  state: Schema.String,
  requested_at: Schema.String,
  started_at: Schema.NullOr(Schema.String),
  completed_at: Schema.NullOr(Schema.String),
})
const TranscriptRow = Schema.Struct({
  item: Schema.String,
})
const ThreadShellRow = Schema.Struct({
  thread_id: Schema.String,
  project_id: Schema.String,
  title: Schema.String,
  provider: Schema.String,
  runtime_mode: Schema.String,
  status: Schema.String,
  created_at: Schema.String,
  updated_at: Schema.String,
  session_status: Schema.NullOr(Schema.String),
  last_error: Schema.NullOr(Schema.String),
  turn_id: Schema.NullOr(Schema.String),
  turn_state: Schema.NullOr(Schema.String),
  requested_at: Schema.NullOr(Schema.String),
  started_at: Schema.NullOr(Schema.String),
  completed_at: Schema.NullOr(Schema.String),
})

const decodeSequenceRow = Schema.decodeEffect(SequenceRow)
const decodeProjectRow = Schema.decodeEffect(ProjectRow)
const decodeColumnRow = Schema.decodeEffect(ColumnRow)
const decodeTicketRow = Schema.decodeEffect(TicketRow)
const decodeDependencyRow = Schema.decodeEffect(DependencyRow)
const decodeTicketThreadRow = Schema.decodeEffect(TicketThreadRow)
const decodeTicketActivityRow = Schema.decodeEffect(TicketActivityRow)
const decodeThreadRow = Schema.decodeEffect(ThreadRow)
const decodeSessionRow = Schema.decodeEffect(SessionRow)
const decodeTurnRow = Schema.decodeEffect(TurnRow)
const decodeTranscriptRow = Schema.decodeEffect(TranscriptRow)
const decodeThreadShellRow = Schema.decodeEffect(ThreadShellRow)
const decodeBoardSnapshot = Schema.decodeUnknownEffect(BoardSnapshot)
const decodeThreadSnapshot = Schema.decodeUnknownEffect(ThreadSnapshot)
const decodeShellSnapshot = Schema.decodeUnknownEffect(ShellSnapshot)
const decodeResumeCursor = Schema.decodeEffect(Schema.fromJsonString(ResumeCursor))
const decodeTranscriptItem = Schema.decodeEffect(Schema.fromJsonString(TranscriptItem))
const decodeJson = Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))
const encodeEnvironment = Schema.encodeEffect(Environment)

const readLatestSequence = Effect.fn("Snapshots.readLatestSequence")(function* () {
  const sql = yield* SqlClient
  const rows = yield* sql<
    (typeof SequenceRow)["Encoded"]
  >`SELECT COALESCE(MAX(sequence), 0) AS sequence FROM events`
  const row = rows[0]
  if (row === undefined) {
    return yield* Effect.die("Snapshot sequence query returned no row")
  }
  return (yield* decodeSequenceRow(row).pipe(Effect.orDie)).sequence
})

const encodedProject = (row: (typeof ProjectRow)["Type"]) => ({
  id: row.project_id,
  name: row.name,
  workspaceRoot: row.workspace_root,
  available: row.available === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const encodedSession = Effect.fn("Snapshots.encodedSession")(function* (
  row: (typeof SessionRow)["Type"],
) {
  return {
    threadId: row.thread_id,
    status: row.status,
    lastError: row.last_error,
    activeTurnId: row.active_turn_id,
    runtimeMode: row.runtime_mode,
    resumeCursor:
      row.resume_cursor === null
        ? null
        : yield* decodeResumeCursor(row.resume_cursor).pipe(Effect.orDie),
    updatedAt: row.updated_at,
  }
})

const encodedLatestTurn = (row: (typeof TurnRow)["Type"]) => ({
  turnId: row.turn_id,
  state: row.state,
  requestedAt: row.requested_at,
  startedAt: row.started_at,
  completedAt: row.completed_at,
})

/** Reads a coherent Board projection at one global journal sequence. */
export const readBoardSnapshot = Effect.fn("readBoardSnapshot")(function* (projectId: ProjectId) {
  const sql = yield* SqlClient
  return yield* sql.withTransaction(
    Effect.gen(function* () {
      const projectRows = yield* sql<(typeof ProjectRow)["Encoded"]>`
        SELECT project_id, name, workspace_root, available, created_at, updated_at
        FROM projection_projects
        WHERE project_id = ${projectId}
      `
      const projectRow = projectRows[0]
      if (projectRow === undefined) {
        return Option.none()
      }
      const project = yield* decodeProjectRow(projectRow).pipe(Effect.orDie)
      const [
        snapshotSequence,
        rawColumns,
        rawTickets,
        rawDependencies,
        rawTicketThreads,
        rawTicketActivity,
      ] = yield* Effect.all([
        readLatestSequence(),
        sql<(typeof ColumnRow)["Encoded"]>`
            SELECT
              column_id, project_id, name, color, rank, done, created_at, updated_at
            FROM projection_columns
            WHERE project_id = ${projectId}
            ORDER BY rank, column_id
          `,
        sql<(typeof TicketRow)["Encoded"]>`
            SELECT
              ticket_id, project_id, column_id, rank, title, description, priority, due_at,
              done, archived_at, last_active_column_id, assignee_id, created_at, updated_at
            FROM projection_tickets
            WHERE project_id = ${projectId}
            ORDER BY column_id, rank, ticket_id
          `,
        sql<(typeof DependencyRow)["Encoded"]>`
            SELECT dependency.ticket_id, dependency.depends_on_ticket_id
            FROM projection_ticket_dependencies AS dependency
            JOIN projection_tickets AS ticket ON ticket.ticket_id = dependency.ticket_id
            WHERE ticket.project_id = ${projectId}
            ORDER BY dependency.ticket_id, dependency.depends_on_ticket_id
          `,
        sql<(typeof TicketThreadRow)["Encoded"]>`
            SELECT link.ticket_id, link.thread_id
            FROM projection_ticket_threads AS link
            JOIN projection_tickets AS ticket ON ticket.ticket_id = link.ticket_id
            WHERE ticket.project_id = ${projectId}
            ORDER BY link.ticket_id, link.thread_id
          `,
        sql<(typeof TicketActivityRow)["Encoded"]>`
            WITH ranked_ticket_events AS (
              SELECT
                json_extract(event, '$.ticketId') AS ticket_id,
                event_id,
                sequence,
                project_id,
                actor_id,
                correlation_id,
                causation_id,
                occurred_at,
                schema_version,
                event,
                ROW_NUMBER() OVER (
                  PARTITION BY json_extract(event, '$.ticketId')
                  ORDER BY sequence DESC
                ) AS activity_rank
              FROM events
              WHERE project_id = ${projectId}
                AND json_extract(event, '$._tag') LIKE 'ticket.%'
                AND json_extract(event, '$.ticketId') IS NOT NULL
            )
            SELECT
              ticket_id,
              event_id,
              sequence,
              project_id,
              actor_id,
              correlation_id,
              causation_id,
              occurred_at,
              schema_version,
              event
            FROM ranked_ticket_events
            WHERE activity_rank <= ${TICKET_ACTIVITY_LIMIT}
            ORDER BY ticket_id, sequence DESC
          `,
      ])
      const columns = yield* Effect.forEach(rawColumns, (raw) =>
        decodeColumnRow(raw).pipe(
          Effect.orDie,
          Effect.map((row) => ({
            id: row.column_id,
            projectId: row.project_id,
            name: row.name,
            color: row.color,
            rank: row.rank,
            done: row.done === 1,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          })),
        ),
      )
      const tickets = yield* Effect.forEach(rawTickets, (raw) =>
        decodeTicketRow(raw).pipe(
          Effect.orDie,
          Effect.map((row) => {
            const ticket = {
              id: row.ticket_id,
              projectId: row.project_id,
              columnId: row.column_id,
              rank: row.rank,
              title: row.title,
              priority: row.priority,
              done: row.done === 1,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            }
            if (row.description !== null) {
              Object.assign(ticket, { description: row.description })
            }
            if (row.due_at !== null) {
              Object.assign(ticket, { dueAt: row.due_at })
            }
            if (row.archived_at !== null) {
              Object.assign(ticket, { archivedAt: row.archived_at })
            }
            if (row.last_active_column_id !== null) {
              Object.assign(ticket, { lastActiveColumnId: row.last_active_column_id })
            }
            if (row.assignee_id !== null) {
              Object.assign(ticket, { assigneeId: row.assignee_id })
            }
            return ticket
          }),
        ),
      )
      const ticketDependencies = yield* Effect.forEach(rawDependencies, (raw) =>
        decodeDependencyRow(raw).pipe(
          Effect.orDie,
          Effect.map((row) => ({
            ticketId: row.ticket_id,
            dependsOnTicketId: row.depends_on_ticket_id,
          })),
        ),
      )
      const ticketThreads = yield* Effect.forEach(rawTicketThreads, (raw) =>
        decodeTicketThreadRow(raw).pipe(
          Effect.orDie,
          Effect.map((row) => ({ ticketId: row.ticket_id, threadId: row.thread_id })),
        ),
      )
      interface EncodedActivityEnvelope {
        readonly eventId: string
        readonly sequence: number
        readonly projectId: string
        readonly actorId: string
        readonly correlationId: string
        readonly causationId: string
        readonly occurredAt: string
        readonly schemaVersion: number
        readonly event: unknown
      }
      const activityByTicket = new Map<string, Array<EncodedActivityEnvelope>>()
      for (const raw of rawTicketActivity) {
        const row = yield* decodeTicketActivityRow(raw).pipe(Effect.orDie)
        const events = activityByTicket.get(row.ticket_id) ?? []
        events.push({
          eventId: row.event_id,
          sequence: row.sequence,
          projectId: row.project_id,
          actorId: row.actor_id,
          correlationId: row.correlation_id,
          causationId: row.causation_id,
          occurredAt: row.occurred_at,
          schemaVersion: row.schema_version,
          event: yield* decodeJson(row.event).pipe(Effect.orDie),
        })
        activityByTicket.set(row.ticket_id, events)
      }
      const ticketActivity = [...activityByTicket].map(([ticketId, events]) => ({
        ticketId,
        events,
      }))
      const snapshot = yield* decodeBoardSnapshot({
        snapshotSequence,
        projectId,
        project: encodedProject(project),
        columns,
        tickets,
        ticketDependencies,
        ticketThreads,
        ticketActivity,
      }).pipe(Effect.orDie)
      return Option.some(snapshot)
    }),
  )
})

/** Reads a Thread, its projected Session, ordered Turns, and transcript. */
export const readThreadSnapshot = Effect.fn("readThreadSnapshot")(function* (threadId: ThreadId) {
  const sql = yield* SqlClient
  return yield* sql.withTransaction(
    Effect.gen(function* () {
      const threadRows = yield* sql<(typeof ThreadRow)["Encoded"]>`
        SELECT
          thread_id, project_id, title, provider, runtime_mode, model_id, reasoning_effort,
          service_tier, thinking, status, created_at, updated_at, archived_at
        FROM projection_threads
        WHERE thread_id = ${threadId}
      `
      const rawThread = threadRows[0]
      if (rawThread === undefined) {
        return Option.none()
      }
      const thread = yield* decodeThreadRow(rawThread).pipe(Effect.orDie)
      const [snapshotSequence, rawSessions, rawTurns, rawTranscript] = yield* Effect.all([
        readLatestSequence(),
        sql<(typeof SessionRow)["Encoded"]>`
          SELECT
            thread_id, status, last_error, active_turn_id, runtime_mode, resume_cursor, updated_at
          FROM projection_sessions
          WHERE thread_id = ${threadId}
        `,
        sql<(typeof TurnRow)["Encoded"]>`
          SELECT
            turn_id, thread_id, ordinal, state, requested_at, started_at, completed_at
          FROM projection_turns
          WHERE thread_id = ${threadId}
          ORDER BY ordinal
        `,
        sql<(typeof TranscriptRow)["Encoded"]>`
          SELECT item
          FROM projection_transcript
          WHERE thread_id = ${threadId}
          ORDER BY ordinal
        `,
      ])
      const rawSession = rawSessions[0]
      const session =
        rawSession === undefined
          ? null
          : yield* decodeSessionRow(rawSession).pipe(Effect.orDie, Effect.flatMap(encodedSession))
      const turns = yield* Effect.forEach(rawTurns, (raw) =>
        decodeTurnRow(raw).pipe(
          Effect.orDie,
          Effect.map((row) => ({
            id: row.turn_id,
            threadId: row.thread_id,
            ordinal: row.ordinal,
            state: row.state,
            requestedAt: row.requested_at,
            startedAt: row.started_at,
            completedAt: row.completed_at,
          })),
        ),
      )
      const transcript = yield* Effect.forEach(rawTranscript, (raw) =>
        decodeTranscriptRow(raw).pipe(
          Effect.orDie,
          Effect.flatMap((row) => decodeTranscriptItem(row.item).pipe(Effect.orDie)),
        ),
      )
      const latest = rawTurns.at(-1)
      const latestTurn =
        latest === undefined
          ? null
          : encodedLatestTurn(yield* decodeTurnRow(latest).pipe(Effect.orDie))
      const modelSelection: ModelSelection | null =
        thread.model_id === null ? null : { modelId: thread.model_id }
      if (modelSelection !== null && thread.reasoning_effort !== null) {
        Object.assign(modelSelection, { reasoningEffort: thread.reasoning_effort })
      }
      if (modelSelection !== null && thread.service_tier !== null) {
        Object.assign(modelSelection, { serviceTier: thread.service_tier })
      }
      if (modelSelection !== null && thread.thinking !== null) {
        Object.assign(modelSelection, { thinking: thread.thinking === 1 })
      }
      const encodedThread = {
        id: thread.thread_id,
        projectId: thread.project_id,
        title: thread.title,
        provider: thread.provider,
        runtimeMode: thread.runtime_mode,
        modelSelection,
        status: thread.status,
        session,
        latestTurn,
        createdAt: thread.created_at,
        updatedAt: thread.updated_at,
      }
      if (thread.archived_at !== null) {
        Object.assign(encodedThread, { archivedAt: thread.archived_at })
      }
      const snapshot = yield* decodeThreadSnapshot({
        snapshotSequence,
        thread: encodedThread,
        session,
        turns,
        transcript,
      }).pipe(Effect.orDie)
      return Option.some(snapshot)
    }),
  )
})

/** Reads the Environment shell used by `subscribeShell`. */
export const readShellSnapshot = Effect.fn("readShellSnapshot")(function* (
  environment: Environment,
) {
  const sql = yield* SqlClient
  return yield* sql.withTransaction(
    Effect.gen(function* () {
      const [snapshotSequence, rawProjects, rawThreads, encodedEnvironment] = yield* Effect.all([
        readLatestSequence(),
        sql<(typeof ProjectRow)["Encoded"]>`
          SELECT project_id, name, workspace_root, available, created_at, updated_at
          FROM projection_projects
          ORDER BY created_at, project_id
        `,
        sql<(typeof ThreadShellRow)["Encoded"]>`
          SELECT
            thread.thread_id,
            thread.project_id,
            thread.title,
            thread.provider,
            thread.runtime_mode,
            thread.status,
            thread.created_at,
            thread.updated_at,
            session.status AS session_status,
            session.last_error,
            turn.turn_id,
            turn.state AS turn_state,
            turn.requested_at,
            turn.started_at,
            turn.completed_at
          FROM projection_threads AS thread
          LEFT JOIN projection_sessions AS session ON session.thread_id = thread.thread_id
          LEFT JOIN projection_turns AS turn ON turn.turn_id = (
            SELECT latest.turn_id
            FROM projection_turns AS latest
            WHERE latest.thread_id = thread.thread_id
            ORDER BY latest.ordinal DESC
            LIMIT 1
          )
          ORDER BY thread.updated_at DESC, thread.thread_id
        `,
        encodeEnvironment(environment),
      ])
      const projects = yield* Effect.forEach(rawProjects, (raw) =>
        decodeProjectRow(raw).pipe(Effect.orDie, Effect.map(encodedProject)),
      )
      const threads = yield* Effect.forEach(rawThreads, (raw) =>
        decodeThreadShellRow(raw).pipe(
          Effect.orDie,
          Effect.map((row) => ({
            id: row.thread_id,
            projectId: row.project_id,
            title: row.title,
            provider: row.provider,
            runtimeMode: row.runtime_mode,
            status: row.status,
            latestTurn:
              row.turn_id === null || row.turn_state === null || row.requested_at === null
                ? null
                : {
                    turnId: row.turn_id,
                    state: row.turn_state,
                    requestedAt: row.requested_at,
                    startedAt: row.started_at,
                    completedAt: row.completed_at,
                  },
            sessionStatus: row.session_status,
            lastError: row.last_error,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          })),
        ),
      )
      return yield* decodeShellSnapshot({
        snapshotSequence,
        environment: encodedEnvironment,
        projects,
        threads,
      }).pipe(Effect.orDie)
    }),
  )
})
