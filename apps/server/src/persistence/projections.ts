import { ProviderUserInputAnswers } from "@noyau/contracts/entities/approvals"
import type { WorkspaceRoot } from "@noyau/contracts/entities/environment"
import { DefaultModelSelection } from "@noyau/contracts/entities/model-selection"
import { RuntimeMode } from "@noyau/contracts/entities/runtime-mode"
import type { TranscriptItem } from "@noyau/contracts/entities/transcript"
import { TranscriptItem as TranscriptItemSchema } from "@noyau/contracts/entities/transcript"
import { ProviderForkPoint, TurnDiffFile } from "@noyau/contracts/entities/turn"
import type { DomainEvent } from "@noyau/contracts/events"
import { ProjectId, type ProjectId as ProjectIdType } from "@noyau/contracts/ids"
import { DEFAULT_THREAD_TITLE, LEGACY_DEFAULT_THREAD_TITLES } from "@noyau/contracts/thread/title"
import { settledTurnStateForSessionStatus } from "@noyau/server/orchestration/thread/projector"
import { DateTime, Effect, Option, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

import type { PersistedEvent } from "./command-worker.ts"

const JsonTranscriptItem = Schema.fromJsonString(TranscriptItemSchema)
const encodeTranscriptItem = Schema.encodeEffect(JsonTranscriptItem)
const decodeTranscriptItem = Schema.decodeEffect(JsonTranscriptItem)
const JsonUserInputAnswers = Schema.fromJsonString(ProviderUserInputAnswers)
const encodeUserInputAnswers = Schema.encodeEffect(JsonUserInputAnswers)
const JsonTurnDiffFiles = Schema.fromJsonString(Schema.Array(TurnDiffFile))
const encodeTurnDiffFiles = Schema.encodeEffect(JsonTurnDiffFiles)
const JsonProviderForkPoint = Schema.fromJsonString(ProviderForkPoint)
const encodeProviderForkPoint = Schema.encodeEffect(JsonProviderForkPoint)
const JsonDefaultModelSelection = Schema.fromJsonString(DefaultModelSelection)
const encodeDefaultModelSelection = Schema.encodeEffect(JsonDefaultModelSelection)

const ResumeCursorJson = Schema.fromJsonString(
  Schema.Struct({
    schemaVersion: Schema.Literal(1),
    sessionId: Schema.NonEmptyString,
  }),
)
const encodeResumeCursor = Schema.encodeEffect(ResumeCursorJson)

const CountRow = Schema.Struct({ count: Schema.Int })
const OrdinalRow = Schema.Struct({ ordinal: Schema.Int })
const TranscriptRow = Schema.Struct({
  transcript_id: Schema.String,
  item: Schema.String,
})
const ActiveTurnRow = Schema.Struct({
  active_turn_id: Schema.NullOr(Schema.String),
})
const ProjectOwnerRow = Schema.Struct({ project_id: ProjectId })
const ForkSourceRow = Schema.Struct({
  project_id: ProjectId,
  title: Schema.String,
  provider: Schema.String,
  runtime_mode: RuntimeMode,
  model_id: Schema.NullOr(Schema.String),
  reasoning_effort: Schema.NullOr(Schema.String),
  service_tier: Schema.NullOr(Schema.String),
  thinking: Schema.NullOr(Schema.Int),
  branch: Schema.NullOr(Schema.String),
  worktree_path: Schema.NullOr(Schema.String),
})

const decodeCountRow = Schema.decodeEffect(CountRow)
const decodeOrdinalRow = Schema.decodeEffect(OrdinalRow)
const decodeTranscriptRow = Schema.decodeEffect(TranscriptRow)
const decodeActiveTurnRow = Schema.decodeEffect(ActiveTurnRow)
const decodeProjectOwnerRow = Schema.decodeEffect(ProjectOwnerRow)
const decodeForkSourceRow = Schema.decodeEffect(ForkSourceRow)

/**
 * Resolves the current owner of a WorkspaceRoot from the durable projection.
 * The command worker calls this inside its transaction before the pure decider.
 */
export const findWorkspaceRootOwner = Effect.fn("Projections.findWorkspaceRootOwner")(function* (
  workspaceRoot: WorkspaceRoot,
  excludedProjectId?: ProjectIdType,
) {
  const sql = yield* SqlClient
  const rows =
    excludedProjectId === undefined
      ? yield* sql<(typeof ProjectOwnerRow)["Encoded"]>`
          SELECT project_id
          FROM projection_projects
          WHERE workspace_root = ${workspaceRoot}
          LIMIT 1
        `
      : yield* sql<(typeof ProjectOwnerRow)["Encoded"]>`
          SELECT project_id
          FROM projection_projects
          WHERE workspace_root = ${workspaceRoot}
            AND project_id <> ${excludedProjectId}
          LIMIT 1
        `
  const row = rows[0]
  return row === undefined
    ? Option.none<ProjectIdType>()
    : Option.some((yield* decodeProjectOwnerRow(row).pipe(Effect.orDie)).project_id)
})

const timeOf = (event: PersistedEvent<DomainEvent>) => DateTime.formatIso(event.occurredAt)

const nextTranscriptOrdinal = Effect.fn("Projections.nextTranscriptOrdinal")(function* (
  threadId: string,
) {
  const sql = yield* SqlClient
  const rows = yield* sql<(typeof OrdinalRow)["Encoded"]>`
    SELECT COALESCE(MAX(ordinal), 0) + 1 AS ordinal
    FROM projection_transcript
    WHERE thread_id = ${threadId}
  `
  const row = rows[0]
  if (row === undefined) {
    return yield* Effect.die("Transcript ordinal query returned no row")
  }
  return (yield* decodeOrdinalRow(row).pipe(Effect.orDie)).ordinal
})

const putTranscriptItem = Effect.fn("Projections.putTranscriptItem")(function* (
  transcriptId: string,
  item: TranscriptItem,
  eventSequence: number,
) {
  const sql = yield* SqlClient
  const encodedItem = yield* encodeTranscriptItem(item).pipe(Effect.orDie)
  const ordinal = yield* nextTranscriptOrdinal(item.threadId)
  yield* sql`
    INSERT INTO projection_transcript (
      transcript_id, thread_id, turn_id, ordinal, kind, item, event_sequence
    ) VALUES (
      ${transcriptId}, ${item.threadId}, ${item.turnId}, ${ordinal}, ${item._tag},
      ${encodedItem}, ${eventSequence}
    )
    ON CONFLICT (transcript_id) DO UPDATE SET
      kind = excluded.kind,
      item = excluded.item,
      event_sequence = excluded.event_sequence
  `
})

const appendAssistantTranscript = Effect.fn("Projections.appendAssistantTranscript")(function* (
  item: Extract<TranscriptItem, { readonly _tag: "transcript.assistant" }>,
  eventSequence: number,
) {
  const sql = yield* SqlClient
  const rows = yield* sql<(typeof TranscriptRow)["Encoded"]>`
    SELECT transcript_id, item
    FROM projection_transcript
    WHERE thread_id = ${item.threadId}
    ORDER BY ordinal DESC
    LIMIT 1
  `
  const lastRow = rows[0]
  if (lastRow !== undefined) {
    const decodedRow = yield* decodeTranscriptRow(lastRow).pipe(Effect.orDie)
    const previous = yield* decodeTranscriptItem(decodedRow.item).pipe(Effect.orDie)
    if (previous._tag === "transcript.assistant" && previous.turnId === item.turnId) {
      const encodedItem = yield* encodeTranscriptItem({
        ...previous,
        text: `${previous.text}${item.text}`,
      }).pipe(Effect.orDie)
      yield* sql`
        UPDATE projection_transcript
        SET item = ${encodedItem}, event_sequence = ${eventSequence}
        WHERE transcript_id = ${decodedRow.transcript_id}
      `
      return
    }
  }
  yield* putTranscriptItem(`assistant:${item.turnId}:${eventSequence}`, item, eventSequence)
})

const projectTranscriptItem = Effect.fn("Projections.projectTranscriptItem")(function* (
  item: TranscriptItem,
  eventSequence: number,
) {
  const sql = yield* SqlClient
  const turnRows = yield* sql<(typeof CountRow)["Encoded"]>`
    SELECT COUNT(*) AS count
    FROM projection_turns
    WHERE turn_id = ${item.turnId}
      AND thread_id = ${item.threadId}
      AND state = 'running'
  `
  const turnRow = turnRows[0]
  if (turnRow === undefined || (yield* decodeCountRow(turnRow).pipe(Effect.orDie)).count === 0) {
    return
  }

  switch (item._tag) {
    case "transcript.user":
      yield* putTranscriptItem(`user:${item.turnId}`, item, eventSequence)
      return
    case "transcript.assistant":
      yield* appendAssistantTranscript(item, eventSequence)
      return
    case "transcript.tool":
      yield* putTranscriptItem(`tool:${item.turnId}:${item.toolCallId}`, item, eventSequence)
      return
    case "transcript.permission":
      yield* putTranscriptItem(`permission:${item.turnId}:${item.requestId}`, item, eventSequence)
      return
    case "transcript.user-input":
      yield* putTranscriptItem(`user-input:${item.turnId}:${item.requestId}`, item, eventSequence)
      return
    case "transcript.plan":
      yield* putTranscriptItem(`plan:${item.turnId}`, item, eventSequence)
      return
  }
})

const projectProjectEvent = Effect.fn("Projections.projectProjectEvent")(function* (
  persisted: PersistedEvent<DomainEvent>,
) {
  const sql = yield* SqlClient
  const event = persisted.event
  const occurredAt = timeOf(persisted)

  switch (event._tag) {
    case "project.created":
      const createdDefaultModelSelection =
        event.defaultModelSelection === undefined || event.defaultModelSelection === null
          ? null
          : yield* encodeDefaultModelSelection(event.defaultModelSelection).pipe(Effect.orDie)
      yield* sql`
        INSERT INTO projection_projects (
          project_id, name, workspace_root, default_model_selection_json,
          available, created_at, updated_at
        ) VALUES (
          ${event.projectId}, ${event.name}, ${event.workspaceRoot},
          ${createdDefaultModelSelection},
          1, ${occurredAt}, ${occurredAt}
        )
      `
      return
    case "project.meta-updated":
      if (event.name !== undefined) {
        yield* sql`
          UPDATE projection_projects
          SET name = ${event.name}, updated_at = ${occurredAt}
          WHERE project_id = ${event.projectId}
        `
      }
      if (event.defaultModelSelection !== undefined) {
        const updatedDefaultModelSelection =
          event.defaultModelSelection === null
            ? null
            : yield* encodeDefaultModelSelection(event.defaultModelSelection).pipe(Effect.orDie)
        yield* sql`
          UPDATE projection_projects
          SET default_model_selection_json = ${updatedDefaultModelSelection},
            updated_at = ${occurredAt}
          WHERE project_id = ${event.projectId}
        `
      }
      return
    case "project.rebound":
      yield* sql`
        UPDATE projection_projects
        SET workspace_root = ${event.workspaceRoot}, available = 1, updated_at = ${occurredAt}
        WHERE project_id = ${event.projectId}
      `
      return
    case "project.deleted":
      // Tickets reference columns without ON DELETE. A project cascade that
      // removes columns first violates that FK while tickets still exist.
      yield* sql`
        DELETE FROM projection_tickets
        WHERE project_id = ${event.projectId}
      `
      yield* sql`
        DELETE FROM projection_projects
        WHERE project_id = ${event.projectId}
      `
      return
    default:
      return
  }
})

const projectBoardEvent = Effect.fn("Projections.projectBoardEvent")(function* (
  persisted: PersistedEvent<DomainEvent>,
) {
  const sql = yield* SqlClient
  const event = persisted.event
  const occurredAt = timeOf(persisted)

  switch (event._tag) {
    case "board.initialized":
      return
    case "kanbanColumn.created":
      yield* sql`
        INSERT INTO projection_columns (
          column_id, project_id, name, color, rank, done, created_at, updated_at
        ) VALUES (
          ${event.columnId}, ${persisted.projectId}, ${event.name}, ${event.color}, ${event.rank},
          ${event.done ? 1 : 0}, ${occurredAt}, ${occurredAt}
        )
      `
      return
    case "kanbanColumn.updated":
      if (event.name !== undefined) {
        yield* sql`
          UPDATE projection_columns
          SET name = ${event.name}, updated_at = ${occurredAt}
          WHERE column_id = ${event.columnId}
        `
      }
      if (event.color !== undefined) {
        yield* sql`
          UPDATE projection_columns
          SET color = ${event.color}, updated_at = ${occurredAt}
          WHERE column_id = ${event.columnId}
        `
      }
      return
    case "kanbanColumn.moved":
      yield* sql`
        UPDATE projection_columns
        SET rank = ${event.rank}, updated_at = ${occurredAt}
        WHERE column_id = ${event.columnId}
      `
      return
    case "kanbanColumn.deleted":
      if (event.destinationColumnId !== undefined) {
        yield* sql`
          UPDATE projection_tickets
          SET column_id = ${event.destinationColumnId}, updated_at = ${occurredAt}
          WHERE column_id = ${event.columnId}
            AND archived_at IS NOT NULL
        `
        yield* sql`
          UPDATE projection_tickets
          SET last_active_column_id = ${event.destinationColumnId}, updated_at = ${occurredAt}
          WHERE last_active_column_id = ${event.columnId}
            AND done = 1
        `
      }
      yield* sql`
        DELETE FROM projection_columns
        WHERE column_id = ${event.columnId}
      `
      return
    case "ticket.created":
      yield* sql`
        INSERT INTO projection_tickets (
          ticket_id, project_id, column_id, rank, title, priority, done, created_at, updated_at
        ) VALUES (
          ${event.ticketId}, ${persisted.projectId}, ${event.columnId}, ${event.rank}, ${event.title},
          'none', 0, ${occurredAt}, ${occurredAt}
        )
      `
      return
    case "ticket.moved":
      yield* sql`
        UPDATE projection_tickets
        SET column_id = ${event.columnId}, rank = ${event.rank}, updated_at = ${occurredAt}
        WHERE ticket_id = ${event.ticketId}
      `
      return
    case "ticket.completed":
      yield* sql`
        UPDATE projection_tickets
        SET
          column_id = ${event.doneColumnId},
          rank = ${event.rank},
          done = 1,
          last_active_column_id = ${event.previousColumnId},
          updated_at = ${occurredAt}
        WHERE ticket_id = ${event.ticketId}
      `
      return
    case "ticket.reopened":
      yield* sql`
        UPDATE projection_tickets
        SET column_id = ${event.columnId}, rank = ${event.rank}, done = 0, updated_at = ${occurredAt}
        WHERE ticket_id = ${event.ticketId}
      `
      return
    case "ticket.archived":
      yield* sql`
        UPDATE projection_tickets
        SET archived_at = ${occurredAt}, updated_at = ${occurredAt}
        WHERE ticket_id = ${event.ticketId}
      `
      return
    case "ticket.restored":
      yield* sql`
        UPDATE projection_tickets
        SET
          column_id = ${event.columnId},
          rank = ${event.rank},
          archived_at = NULL,
          updated_at = ${occurredAt}
        WHERE ticket_id = ${event.ticketId}
      `
      return
    case "ticket.assigned":
      yield* sql`
        UPDATE projection_tickets
        SET assignee_id = ${event.assigneeId ?? null}, updated_at = ${occurredAt}
        WHERE ticket_id = ${event.ticketId}
      `
      return
    case "ticket.updated":
      if (event.title !== undefined) {
        yield* sql`
          UPDATE projection_tickets
          SET title = ${event.title}, updated_at = ${occurredAt}
          WHERE ticket_id = ${event.ticketId}
        `
      }
      if (event.description !== undefined) {
        yield* sql`
          UPDATE projection_tickets
          SET description = ${event.description}, updated_at = ${occurredAt}
          WHERE ticket_id = ${event.ticketId}
        `
      }
      if (event.priority !== undefined) {
        yield* sql`
          UPDATE projection_tickets
          SET priority = ${event.priority}, updated_at = ${occurredAt}
          WHERE ticket_id = ${event.ticketId}
        `
      }
      if (event.dueAt !== undefined) {
        const dueAt = event.dueAt === null ? null : DateTime.formatIso(event.dueAt)
        yield* sql`
          UPDATE projection_tickets
          SET due_at = ${dueAt}, updated_at = ${occurredAt}
          WHERE ticket_id = ${event.ticketId}
        `
      }
      return
    case "ticket.dependency.added":
      yield* sql`
        INSERT INTO projection_ticket_dependencies (ticket_id, depends_on_ticket_id)
        VALUES (${event.ticketId}, ${event.dependsOnTicketId})
      `
      return
    case "ticket.dependency.removed":
      yield* sql`
        DELETE FROM projection_ticket_dependencies
        WHERE ticket_id = ${event.ticketId}
          AND depends_on_ticket_id = ${event.dependsOnTicketId}
      `
      return
    case "ticket.thread.linked":
      yield* sql`
        INSERT INTO projection_ticket_threads (ticket_id, thread_id)
        VALUES (${event.ticketId}, ${event.threadId})
      `
      return
    case "ticket.thread.unlinked":
      yield* sql`
        DELETE FROM projection_ticket_threads
        WHERE ticket_id = ${event.ticketId}
          AND thread_id = ${event.threadId}
      `
      return
    default:
      return
  }
})

const projectSession = Effect.fn("Projections.projectSession")(function* (
  persisted: PersistedEvent<DomainEvent>,
  event: Extract<DomainEvent, { readonly _tag: "thread.session-set" }>,
) {
  const sql = yield* SqlClient
  const session = event.session
  const previousRows = yield* sql<(typeof ActiveTurnRow)["Encoded"]>`
    SELECT active_turn_id
    FROM projection_sessions
    WHERE thread_id = ${event.threadId}
  `
  const previousRow = previousRows[0]
  const previousActiveTurnId =
    previousRow === undefined
      ? null
      : (yield* decodeActiveTurnRow(previousRow).pipe(Effect.orDie)).active_turn_id
  const settlement = settledTurnStateForSessionStatus(session.status)
  const updatedAt = DateTime.formatIso(session.updatedAt)

  if (session.status === "running" && session.activeTurnId !== null) {
    yield* sql`
      UPDATE projection_turns
      SET started_at = COALESCE(started_at, requested_at)
      WHERE turn_id = ${session.activeTurnId}
        AND state = 'running'
    `
  } else if (settlement !== null) {
    const knownActiveTurnId = previousActiveTurnId ?? session.activeTurnId
    const latestRows =
      knownActiveTurnId === null
        ? yield* sql<(typeof ActiveTurnRow)["Encoded"]>`
            SELECT turn_id AS active_turn_id
            FROM projection_turns
            WHERE thread_id = ${event.threadId}
              AND state = 'running'
            ORDER BY ordinal DESC
            LIMIT 1
          `
        : []
    const latestRow = latestRows[0]
    const latestActiveTurnId =
      latestRow === undefined
        ? null
        : (yield* decodeActiveTurnRow(latestRow).pipe(Effect.orDie)).active_turn_id
    const activeTurnId = knownActiveTurnId ?? latestActiveTurnId
    if (activeTurnId !== null) {
      yield* sql`
        UPDATE projection_turns
        SET state = ${settlement}, completed_at = COALESCE(completed_at, ${updatedAt})
        WHERE turn_id = ${activeTurnId}
          AND state = 'running'
      `
    }
  }

  const resumeCursor =
    session.resumeCursor === null
      ? null
      : yield* encodeResumeCursor(session.resumeCursor).pipe(Effect.orDie)
  yield* sql`
    INSERT INTO projection_sessions (
      thread_id, status, last_error, active_turn_id, runtime_mode, resume_cursor, updated_at
    ) VALUES (
      ${event.threadId}, ${session.status}, ${session.lastError}, ${session.activeTurnId},
      ${session.runtimeMode}, ${resumeCursor}, ${updatedAt}
    )
    ON CONFLICT (thread_id) DO UPDATE SET
      status = excluded.status,
      last_error = excluded.last_error,
      active_turn_id = excluded.active_turn_id,
      runtime_mode = excluded.runtime_mode,
      resume_cursor = excluded.resume_cursor,
      updated_at = excluded.updated_at
  `
  yield* sql`
    UPDATE projection_threads
    SET updated_at = ${timeOf(persisted)}
    WHERE thread_id = ${event.threadId}
  `
})

const transcriptItemTouchesThreadUpdatedAt = (item: TranscriptItem): boolean =>
  item._tag === "transcript.permission" ||
  item._tag === "transcript.user-input" ||
  item._tag === "transcript.user"

const projectThreadEvent = Effect.fn("Projections.projectThreadEvent")(function* (
  persisted: PersistedEvent<DomainEvent>,
) {
  const sql = yield* SqlClient
  const event = persisted.event
  const occurredAt = timeOf(persisted)

  switch (event._tag) {
    case "thread.created":
      yield* sql`
        INSERT INTO projection_threads (
          thread_id, project_id, title, provider, runtime_mode, model_id, reasoning_effort,
          service_tier, thinking, branch, worktree_path, status, created_at, listed_at, updated_at
        ) VALUES (
          ${event.threadId}, ${event.projectId}, ${event.title}, ${event.provider},
          ${event.runtimeMode}, ${event.modelSelection?.modelId ?? null},
          ${event.modelSelection?.reasoningEffort ?? null},
          ${event.modelSelection?.serviceTier ?? null},
          ${event.modelSelection?.thinking === undefined ? null : Number(event.modelSelection.thinking)},
          ${event.branch ?? null}, ${event.worktreePath ?? null},
          'active', ${occurredAt}, ${occurredAt}, ${occurredAt}
        )
      `
      return
    case "thread.fork-requested": {
      const sourceRows = yield* sql<(typeof ForkSourceRow)["Encoded"]>`
        SELECT project_id, title, provider, runtime_mode, model_id, reasoning_effort, service_tier,
          thinking, branch, worktree_path
        FROM projection_threads WHERE thread_id = ${event.sourceThreadId}
      `
      const sourceRow = sourceRows[0]
      if (sourceRow === undefined) return
      const source = yield* decodeForkSourceRow(sourceRow).pipe(Effect.orDie)
      yield* sql`
        INSERT INTO projection_threads (
          thread_id, project_id, title, provider, runtime_mode, model_id, reasoning_effort,
          service_tier, thinking, branch, worktree_path, status, created_at, listed_at, updated_at,
          fork_source_thread_id, fork_source_turn_id
        ) VALUES (
          ${event.threadId}, ${source.project_id}, ${`Fork of ${source.title}`}, ${source.provider},
          ${source.runtime_mode}, ${source.model_id}, ${source.reasoning_effort}, ${source.service_tier},
          ${source.thinking}, ${source.branch}, ${source.worktree_path}, 'active', ${occurredAt},
          ${occurredAt}, ${occurredAt}, ${event.sourceThreadId}, ${event.sourceTurnId}
        )
      `
      const cutoffRows = yield* sql<(typeof OrdinalRow)["Encoded"]>`
        SELECT ordinal FROM projection_turns WHERE turn_id = ${event.sourceTurnId}
      `
      const cutoffRow = cutoffRows[0]
      const cutoff =
        cutoffRow === undefined ? undefined : yield* decodeOrdinalRow(cutoffRow).pipe(Effect.orDie)
      if (cutoff !== undefined) {
        yield* sql`
          INSERT INTO projection_inherited_transcript (thread_id, ordinal, item)
          SELECT ${event.threadId}, inherited.ordinal, inherited.item
          FROM projection_inherited_transcript AS inherited
          WHERE inherited.thread_id = ${event.sourceThreadId}
          ORDER BY inherited.ordinal
        `
        yield* sql`
          INSERT INTO projection_inherited_transcript (thread_id, ordinal, item)
          SELECT
            ${event.threadId},
            transcript.ordinal + (
              SELECT COUNT(*) FROM projection_inherited_transcript
              WHERE thread_id = ${event.sourceThreadId}
            ),
            transcript.item
          FROM projection_transcript AS transcript
          JOIN projection_turns AS turns ON turns.turn_id = transcript.turn_id
          WHERE transcript.thread_id = ${event.sourceThreadId} AND turns.ordinal <= ${cutoff.ordinal}
          ORDER BY transcript.ordinal
        `
      }
      yield* projectSession(persisted, {
        _tag: "thread.session-set",
        threadId: event.threadId,
        session: {
          threadId: event.threadId,
          status: "starting",
          lastError: null,
          activeTurnId: null,
          runtimeMode: source.runtime_mode,
          resumeCursor: null,
          updatedAt: persisted.occurredAt,
        },
      })
      return
    }
    case "thread.fork-completed":
      yield* projectSession(persisted, {
        _tag: "thread.session-set",
        threadId: event.threadId,
        session: event.session,
      })
      return
    case "thread.fork-failed":
      yield* sql`
        UPDATE projection_sessions
        SET status = 'error', last_error = ${event.detail}, updated_at = ${occurredAt}
        WHERE thread_id = ${event.threadId}
      `
      yield* sql`
        UPDATE projection_threads SET updated_at = ${occurredAt} WHERE thread_id = ${event.threadId}
      `
      return
    case "thread.deleted":
      yield* sql`
        DELETE FROM projection_threads
        WHERE thread_id = ${event.threadId}
      `
      return
    case "thread.archived":
      yield* sql`
        UPDATE projection_threads
        SET status = 'archived', archived_at = ${occurredAt}, updated_at = ${occurredAt}
        WHERE thread_id = ${event.threadId}
      `
      return
    case "thread.restored":
      yield* sql`
        UPDATE projection_threads
        SET status = 'active', archived_at = NULL, updated_at = ${occurredAt}
        WHERE thread_id = ${event.threadId}
      `
      return
    case "thread.settled":
      yield* sql`
        UPDATE projection_threads
        SET settled_override = 'settled',
            settled_at = ${DateTime.formatIso(event.settledAt)},
            updated_at = CASE
              WHEN settled_override = 'settled' THEN updated_at
              ELSE ${occurredAt}
            END
        WHERE thread_id = ${event.threadId}
      `
      return
    case "thread.unsettled":
      yield* sql`
        UPDATE projection_threads
        SET settled_override = ${event.reason === "user" ? "active" : null},
            settled_at = NULL,
            listed_at = ${occurredAt},
            updated_at = ${occurredAt}
        WHERE thread_id = ${event.threadId}
      `
      return
    case "thread.meta-updated":
      if (event.title !== undefined) {
        yield* sql`
          UPDATE projection_threads
          SET title = ${event.title}, updated_at = ${occurredAt}
          WHERE thread_id = ${event.threadId}
        `
      }
      if (event.branch !== undefined) {
        yield* sql`
          UPDATE projection_threads
          SET branch = ${event.branch}, updated_at = ${occurredAt}
          WHERE thread_id = ${event.threadId}
        `
      }
      if (event.worktreePath !== undefined) {
        yield* sql`
          UPDATE projection_threads
          SET worktree_path = ${event.worktreePath}, updated_at = ${occurredAt}
          WHERE thread_id = ${event.threadId}
        `
      }
      return
    case "thread.runtime-mode-set":
      yield* sql`
        UPDATE projection_threads
        SET runtime_mode = ${event.runtimeMode}, updated_at = ${occurredAt}
        WHERE thread_id = ${event.threadId}
      `
      yield* sql`
        UPDATE projection_sessions
        SET runtime_mode = ${event.runtimeMode}, updated_at = ${occurredAt}
        WHERE thread_id = ${event.threadId}
      `
      return
    case "thread.model-selection-set":
      yield* sql`
        UPDATE projection_threads
        SET model_id = ${event.modelSelection?.modelId ?? null},
            reasoning_effort = ${event.modelSelection?.reasoningEffort ?? null},
            service_tier = ${event.modelSelection?.serviceTier ?? null},
            thinking = ${event.modelSelection?.thinking === undefined ? null : Number(event.modelSelection.thinking)},
            updated_at = ${occurredAt}
        WHERE thread_id = ${event.threadId}
      `
      return
    case "thread.provider-handed-off":
      yield* sql`
        UPDATE projection_threads
        SET provider = ${event.provider},
            model_id = ${event.modelSelection?.modelId ?? null},
            reasoning_effort = ${event.modelSelection?.reasoningEffort ?? null},
            service_tier = ${event.modelSelection?.serviceTier ?? null},
            thinking = ${event.modelSelection?.thinking === undefined ? null : Number(event.modelSelection.thinking)},
            context_used = NULL,
            context_window = NULL,
            updated_at = ${occurredAt}
        WHERE thread_id = ${event.threadId}
      `
      yield* sql`
        DELETE FROM projection_sessions
        WHERE thread_id = ${event.threadId}
      `
      return
    case "thread.turn.started": {
      const existingRows = yield* sql<(typeof CountRow)["Encoded"]>`
        SELECT COUNT(*) AS count
        FROM projection_turns
        WHERE turn_id = ${event.turnId}
      `
      const existingRow = existingRows[0]
      if (
        existingRow !== undefined &&
        (yield* decodeCountRow(existingRow).pipe(Effect.orDie)).count > 0
      ) {
        return
      }
      const ordinalRows = yield* sql<(typeof OrdinalRow)["Encoded"]>`
        SELECT COALESCE(MAX(ordinal), 0) + 1 AS ordinal
        FROM projection_turns
        WHERE thread_id = ${event.threadId}
      `
      const ordinalRow = ordinalRows[0]
      if (ordinalRow === undefined) {
        return yield* Effect.die("Turn ordinal query returned no row")
      }
      const ordinal = (yield* decodeOrdinalRow(ordinalRow).pipe(Effect.orDie)).ordinal
      yield* sql`
        INSERT INTO projection_turns (
          turn_id, thread_id, ordinal, state, requested_at, started_at, completed_at
        ) VALUES (
          ${event.turnId}, ${event.threadId}, ${ordinal}, 'running', ${occurredAt}, ${occurredAt}, NULL
        )
      `
      if (ordinal === 1) {
        const titleSeed = event.titleSeed ?? event.text ?? event.attachments?.[0]?.name
        if (titleSeed !== undefined) {
          yield* sql`
            UPDATE projection_threads
            SET title = ${titleSeed}
            WHERE thread_id = ${event.threadId}
              AND (
                title = ${DEFAULT_THREAD_TITLE}
                OR title = ${LEGACY_DEFAULT_THREAD_TITLES[0]}
                OR title = ${LEGACY_DEFAULT_THREAD_TITLES[1]}
                OR title = ${titleSeed}
              )
          `
        }
      }
      if (event.runtimeMode !== undefined) {
        yield* sql`
          UPDATE projection_threads
          SET runtime_mode = ${event.runtimeMode}
          WHERE thread_id = ${event.threadId}
        `
      }
      if (event.modelSelection !== undefined) {
        yield* sql`
          UPDATE projection_threads
          SET model_id = ${event.modelSelection?.modelId ?? null},
              reasoning_effort = ${event.modelSelection?.reasoningEffort ?? null},
              service_tier = ${event.modelSelection?.serviceTier ?? null},
              thinking = ${event.modelSelection?.thinking === undefined ? null : Number(event.modelSelection.thinking)}
          WHERE thread_id = ${event.threadId}
        `
      }
      let userItem: TranscriptItem = {
        _tag: "transcript.user",
        threadId: event.threadId,
        turnId: event.turnId,
      }
      if (event.text !== undefined) {
        userItem = Object.assign(userItem, { text: event.text })
      }
      if (event.attachments !== undefined) {
        userItem = Object.assign(userItem, { attachments: event.attachments })
      }
      if (event.providerHandoff !== undefined) {
        userItem = Object.assign(userItem, { providerHandoff: event.providerHandoff })
      }
      yield* projectTranscriptItem(userItem, persisted.sequence)
      break
    }
    case "thread.session-set":
      yield* projectSession(persisted, event)
      return
    case "thread.transcript-appended":
      yield* projectTranscriptItem(event.item, persisted.sequence)
      if (!transcriptItemTouchesThreadUpdatedAt(event.item)) {
        return
      }
      break
    case "approval.responded":
      yield* sql`
        UPDATE projection_transcript
        SET item = json_set(item, '$.status', 'resolved'), event_sequence = ${persisted.sequence}
        WHERE thread_id = ${event.threadId}
          AND kind = 'transcript.permission'
          AND json_extract(item, '$.requestId') = ${event.requestId}
      `
      break
    case "user-input.responded": {
      const answersJson = yield* encodeUserInputAnswers(event.answers).pipe(Effect.orDie)
      yield* sql`
        UPDATE projection_transcript
        SET item = json_set(
          item,
          '$.answers', json(${answersJson})
        ),
        event_sequence = ${persisted.sequence}
        WHERE thread_id = ${event.threadId}
          AND kind = 'transcript.user-input'
          AND json_extract(item, '$.requestId') = ${event.requestId}
      `
      break
    }
    case "user-input.detached":
    case "user-input.cancelled": {
      const status = event._tag === "user-input.detached" ? "detached" : "cancelled"
      yield* sql`
        UPDATE projection_transcript
        SET item = json_set(item, '$.status', ${status}), event_sequence = ${persisted.sequence}
        WHERE thread_id = ${event.threadId}
          AND kind = 'transcript.user-input'
          AND json_extract(item, '$.requestId') = ${event.requestId}
      `
      break
    }
    case "user-input.consumed": {
      const answersJson = yield* encodeUserInputAnswers(event.answers).pipe(Effect.orDie)
      yield* sql`
        UPDATE projection_transcript
        SET item = json_set(
          item,
          '$.status', 'consumed',
          '$.answers', json(${answersJson})
        ),
        event_sequence = ${persisted.sequence}
        WHERE thread_id = ${event.threadId}
          AND kind = 'transcript.user-input'
          AND json_extract(item, '$.requestId') = ${event.requestId}
      `
      break
    }
    case "thread.title-seeded":
      yield* sql`
        UPDATE projection_threads
        SET title = ${event.title}
        WHERE thread_id = ${event.threadId}
      `
      break
    case "thread.turn-diff-completed": {
      const filesJson = yield* encodeTurnDiffFiles(event.files).pipe(Effect.orDie)
      yield* sql`
        UPDATE projection_turns
        SET checkpoint_ref = ${event.checkpointRef},
            checkpoint_status = ${event.status},
            checkpoint_files_json = ${filesJson}
        WHERE turn_id = ${event.turnId}
          AND thread_id = ${event.threadId}
          AND (checkpoint_status IS NULL OR checkpoint_status <> 'ready')
      `
      break
    }
    case "thread.turn.ended":
      if (event.providerForkPoint !== undefined) {
        const providerForkPoint = yield* encodeProviderForkPoint(event.providerForkPoint).pipe(
          Effect.orDie,
        )
        yield* sql`
          UPDATE projection_turns
          SET provider_fork_point = ${providerForkPoint}
          WHERE turn_id = ${event.turnId} AND thread_id = ${event.threadId}
        `
      }
      break
    case "thread.context-usage-set":
      yield* sql`
        UPDATE projection_threads
        SET context_used = ${event.contextUsage.used},
            context_window = ${event.contextUsage.window}
        WHERE thread_id = ${event.threadId}
      `
      break
    case "thread.turn.interrupted":
    case "session.stop-requested":
      break
    default:
      return
  }

  const threadId =
    event._tag === "thread.transcript-appended" ? event.item.threadId : event.threadId
  yield* sql`
    UPDATE projection_threads
    SET updated_at = ${occurredAt}
    WHERE thread_id = ${threadId}
  `
})

/**
 * Applies one canonical domain event to SQL. The command worker provides the
 * active transaction, so event, receipt, and read model commit atomically.
 */
export const projectDomainEvent = Effect.fn("projectDomainEvent")(function* (
  event: PersistedEvent<DomainEvent>,
) {
  yield* projectProjectEvent(event)
  yield* projectBoardEvent(event)
  yield* projectThreadEvent(event)
})
