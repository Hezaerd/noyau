import {
  executeBoardInitialize,
  executeTicketCommandRequest,
  readProjectBoardSnapshot,
  readTicketExecutions,
} from "@noyau/database/board/store"
import { readProjectEventHighWater, readProjectEvents } from "@noyau/database/task/store"
import { CurrentActor, ServiceUnavailable } from "@noyau/protocol/control-plane"
import { ActorId, CommandId, KanbanColumnId, type ProjectId } from "@noyau/protocol/ids"
import { ControlPlaneRpcs, ProjectEvent } from "@noyau/protocol/rpc"
import { Crypto, Effect, Stream } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

import { ServerConfig } from "./config"
import { decodeEventCursor, encodeEventCursor } from "./cursor"

const unavailable = (error: unknown) =>
  Effect.logError("PostgreSQL operation failed", error).pipe(
    Effect.andThen(new ServiceUnavailable({ service: "postgresql" })),
  )

const databaseErrors = {
  SqlError: unavailable,
  SchemaError: Effect.die,
} as const

const readInitializedBoard = Effect.fn("ControlPlane.readInitializedBoard")(function* (
  projectId: ProjectId,
) {
  const snapshot = yield* readProjectBoardSnapshot(projectId)
  if (snapshot.columns.length > 0) {
    return snapshot
  }

  const crypto = yield* Crypto.Crypto
  const [commandId, backlogColumnId, activeColumnId, doneColumnId] = yield* Effect.all([
    crypto.randomUUIDv4,
    crypto.randomUUIDv4,
    crypto.randomUUIDv4,
    crypto.randomUUIDv4,
  ])
  yield* executeBoardInitialize({
    commandId: CommandId.make(commandId),
    projectId,
    actorId: ActorId.make("system"),
    backlogColumnId: KanbanColumnId.make(backlogColumnId),
    activeColumnId: KanbanColumnId.make(activeColumnId),
    doneColumnId: KanbanColumnId.make(doneColumnId),
  })

  return yield* readProjectBoardSnapshot(projectId)
})

export const rpcHandlersLayer = ControlPlaneRpcs.toLayer({
  SubmitTicketCommand: ({ projectId, request }) =>
    Effect.gen(function* () {
      const actorId = yield* CurrentActor
      const receipt = yield* executeTicketCommandRequest({
        request,
        projectId,
        actorId,
      }).pipe(Effect.catchTags(databaseErrors))

      yield* Effect.logInfo("Ticket command completed").pipe(
        Effect.annotateLogs({
          actorId,
          commandId: request.commandId,
          commandType: request._tag,
          outcome: receipt.response._tag,
          projectId,
        }),
      )
      return receipt
    }),

  GetBoardSnapshot: ({ projectId }) =>
    readInitializedBoard(projectId).pipe(
      Effect.catchTags({
        ...databaseErrors,
        CommandIdConflict: unavailable,
        InvalidCausation: unavailable,
        PlatformError: unavailable,
      }),
    ),

  GetTicketExecutions: ({ projectId, ticketId }) =>
    readTicketExecutions(projectId, ticketId).pipe(Effect.catchTags(databaseErrors)),

  SubscribeProjectEvents: ({ cursor, projectId }) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const config = yield* ServerConfig
        const sql = yield* SqlClient
        const highWater = yield* readProjectEventHighWater(projectId).pipe(
          Effect.provideService(SqlClient, sql),
          Effect.catchTags(databaseErrors),
        )
        const position = yield* decodeEventCursor(cursor, projectId, highWater)

        return Stream.unfold(position, (afterPosition) =>
          readProjectEvents(projectId, afterPosition, 100).pipe(
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
              cursor: encodeEventCursor(projectId, eventPosition),
              envelope: event,
            }),
          ),
          Stream.provideService(SqlClient, sql),
          Stream.catchTags({
            SchemaError: (error) => Stream.die(error),
            SqlError: (error) => Stream.fromEffect(unavailable(error)),
          }),
        )
      }),
    ),
})
