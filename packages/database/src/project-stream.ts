import { EventEnvelope } from "@noyau/protocol/events"
import type { ProjectId } from "@noyau/protocol/ids"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

const PositionRow = Schema.Struct({ position: Schema.BigIntFromString })
const ProjectEventRow = Schema.Struct({
  position: Schema.BigIntFromString,
  envelope: EventEnvelope,
})

const decodePositionRow = Schema.decodeUnknownEffect(PositionRow)
const decodeProjectEventRow = Schema.decodeUnknownEffect(ProjectEventRow)

export interface ProjectEvent {
  readonly position: bigint
  readonly event: EventEnvelope
}

/** Lit le journal ordonné d'un projet après une position exclusive. */
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
