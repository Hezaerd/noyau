import {
  executeTaskCommandRequest,
  readProjectEventHighWater,
  readProjectEvents,
  readProjectTaskSnapshot,
} from "@noyau/database/task/store"
import {
  ControlPlaneApi,
  CurrentActor,
  InvalidEventCursor,
  ProjectEvent,
  ProjectTaskSnapshot,
  ServiceUnavailable,
} from "@noyau/protocol/control-plane"
import { Effect, Stream } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { SqlClient } from "effect/unstable/sql/SqlClient"

import { ServerConfig } from "./config"
import { decodeEventCursor, encodeEventCursor } from "./cursor"

const unavailable = (error: unknown) =>
  Effect.logError("PostgreSQL operation failed", error).pipe(
    Effect.andThen(
      new ServiceUnavailable({
        service: "postgresql",
      }),
    ),
  )

export const projectHandlersLayer = HttpApiBuilder.group(ControlPlaneApi, "projects", (handlers) =>
  handlers
    .handle("submitTaskCommand", ({ params, payload }) =>
      Effect.gen(function* () {
        const actorId = yield* CurrentActor
        const annotations = {
          actorId,
          commandId: payload.commandId,
          projectId: params.projectId,
        }

        const receipt = yield* executeTaskCommandRequest({
          request: payload,
          projectId: params.projectId,
          actorId,
        }).pipe(
          Effect.catchTags({
            SqlError: unavailable,
            SchemaError: Effect.die,
          }),
          Effect.tapError((error) =>
            Effect.logWarning("Task command failed").pipe(
              Effect.annotateLogs({
                ...annotations,
                outcome:
                  typeof error === "object" && error !== null && "_tag" in error
                    ? error._tag
                    : "defect",
              }),
            ),
          ),
        )

        yield* Effect.logInfo("Task command completed").pipe(
          Effect.annotateLogs({
            ...annotations,
            outcome: receipt.response._tag,
          }),
        )
        return receipt
      }).pipe(
        Effect.withSpan("control-plane.submit-task-command", {
          attributes: {
            commandId: payload.commandId,
            projectId: params.projectId,
          },
        }),
      ),
    )
    .handle("getProjectTasks", ({ params }) =>
      readProjectTaskSnapshot(params.projectId).pipe(
        Effect.catchTags({
          SqlError: unavailable,
          SchemaError: Effect.die,
        }),
        Effect.map(({ position, tasks }) =>
          ProjectTaskSnapshot.make({
            projectId: params.projectId,
            tasks,
            cursor: encodeEventCursor(params.projectId, position),
          }),
        ),
        Effect.withSpan("control-plane.get-project-tasks", {
          attributes: { projectId: params.projectId },
        }),
      ),
    )
    .handle("getProjectEvents", ({ headers, params, query }) =>
      Effect.gen(function* () {
        const config = yield* ServerConfig
        const sql = yield* SqlClient
        const highWater = yield* readProjectEventHighWater(params.projectId).pipe(
          Effect.provideService(SqlClient, sql),
          Effect.catchTags({
            SqlError: unavailable,
            SchemaError: Effect.die,
          }),
        )
        const cursor = headers["last-event-id"] ?? query.cursor
        if (cursor === undefined) {
          return yield* new InvalidEventCursor({ cursor: "" })
        }
        const position = yield* decodeEventCursor(cursor, params.projectId, highWater)

        return Stream.unfold(position, (afterPosition) =>
          readProjectEvents(params.projectId, afterPosition, 100).pipe(
            Effect.flatMap((events) => {
              const last = events.at(-1)
              return last === undefined
                ? Effect.sleep(config.eventPollInterval).pipe(
                    Effect.as([events, afterPosition] as const),
                  )
                : Effect.succeed([events, last.position] as const)
            }),
          ),
        ).pipe(
          Stream.flatMap(Stream.fromArray),
          Stream.map(({ event, position: eventPosition }) =>
            ProjectEvent.make({
              id: encodeEventCursor(params.projectId, eventPosition),
              event: "message",
              data: event,
            }),
          ),
          Stream.provideService(SqlClient, sql),
          Stream.catchTag(["SqlError", "SchemaError"], (error) =>
            Stream.fromEffectDrain(
              Effect.logError("Project event stream stopped", error).pipe(
                Effect.annotateLogs({
                  projectId: params.projectId,
                  outcome: "database_error",
                }),
              ),
            ),
          ),
        )
      }).pipe(
        Effect.withSpan("control-plane.get-project-events", {
          attributes: { projectId: params.projectId },
        }),
      ),
    ),
)

export const healthHandlersLayer = HttpApiBuilder.group(ControlPlaneApi, "health", (handlers) =>
  handlers
    .handle("getLiveness", () => Effect.succeed({ status: "live" as const }))
    .handle("getReadiness", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient
        yield* sql`SELECT 1`.pipe(Effect.catchTag("SqlError", unavailable))
        return { status: "ready" as const }
      }).pipe(Effect.withSpan("control-plane.get-readiness")),
    ),
)
