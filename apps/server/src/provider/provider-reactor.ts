import type { PersistedEvent } from "@noyau/database/command-worker"
import { readThreadSnapshot } from "@noyau/database/snapshots"
import {
  InternalCommand,
  type InternalCommand as InternalCommandType,
} from "@noyau/protocol/commands"
import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import type { ResumeCursor } from "@noyau/protocol/entities/session"
import type { DomainEvent } from "@noyau/protocol/events"
import {
  ActorId,
  CommandId,
  CorrelationId,
  EventId,
  ProjectId,
  type ThreadId,
  type TurnId,
} from "@noyau/protocol/ids"
import { ThreadEvent } from "@noyau/protocol/thread/events"
import { Crypto, DateTime, Effect, Option, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

import { ProviderPort, type ProviderSignal } from "./provider-port.ts"

const ProjectRootRow = Schema.Struct({ workspace_root: Schema.NonEmptyString })
const decodeProjectRootRow = Schema.decodeEffect(ProjectRootRow)
const decodeInternalCommand = Schema.decodeUnknownEffect(InternalCommand)
const systemActor = ActorId.make("system:cursor")
const isThreadEvent = Schema.is(ThreadEvent)

export type DispatchInternal = (command: InternalCommandType) => Effect.Effect<void>
type InternalCommandEncoded = (typeof InternalCommand)["Encoded"]
type InternalCommandBody =
  | Pick<
      Extract<InternalCommandEncoded, { readonly _tag: "thread.session.set" }>,
      "_tag" | "payload"
    >
  | Pick<
      Extract<InternalCommandEncoded, { readonly _tag: "thread.transcript.append" }>,
      "_tag" | "payload"
    >
  | Pick<
      Extract<InternalCommandEncoded, { readonly _tag: "thread.turn.ended" }>,
      "_tag" | "payload"
    >

const projectRoot = Effect.fn("ProviderReactor.projectRoot")(function* (projectId: string) {
  const sql = yield* SqlClient
  const rows = yield* sql<
    (typeof ProjectRootRow)["Encoded"]
  >`SELECT workspace_root FROM projection_projects WHERE project_id = ${projectId}`.pipe(
    Effect.orDie,
  )
  const row = rows[0]
  if (row === undefined) {
    return yield* Effect.die(`Projection project ${projectId} has no WorkspaceRoot`)
  }
  return (yield* decodeProjectRootRow(row).pipe(Effect.orDie)).workspace_root
})

const makeInternalCommand = Effect.fn("ProviderReactor.makeInternalCommand")(function* (
  persisted: PersistedEvent<DomainEvent>,
  body: InternalCommandBody,
) {
  const crypto = yield* Crypto.Crypto
  const commandId = yield* crypto.randomUUIDv4.pipe(Effect.orDie)
  const issuedAt = yield* DateTime.now
  return yield* decodeInternalCommand({
    ...body,
    commandId: CommandId.make(commandId),
    projectId: ProjectId.make(persisted.projectId),
    actorId: systemActor,
    correlationId: CorrelationId.make(persisted.correlationId),
    causationId: EventId.make(persisted.eventId),
    issuedAt: DateTime.formatIso(issuedAt),
    schemaVersion: 1,
  }).pipe(Effect.orDie)
})

const commandForSignal = (
  runtimeMode: RuntimeMode,
  signal: ProviderSignal,
  updatedAt: string,
): InternalCommandBody => {
  switch (signal._tag) {
    case "session":
      return {
        _tag: "thread.session.set",
        payload: {
          threadId: signal.threadId,
          session: {
            threadId: signal.threadId,
            status: signal.status,
            lastError: signal.lastError ?? null,
            activeTurnId:
              signal.status === "starting" || signal.status === "running" ? signal.turnId : null,
            runtimeMode,
            resumeCursor: signal.resumeCursor,
            updatedAt,
          },
        },
      }
    case "transcript":
      return {
        _tag: "thread.transcript.append",
        payload: { item: signal.item },
      }
    case "turn-ended":
      return signal.lastError === undefined
        ? {
            _tag: "thread.turn.ended",
            payload: {
              threadId: signal.threadId,
              turnId: signal.turnId,
              state: signal.state,
            },
          }
        : {
            _tag: "thread.turn.ended",
            payload: {
              threadId: signal.threadId,
              turnId: signal.turnId,
              state: signal.state,
              lastError: signal.lastError,
            },
          }
  }
}

const ingestSignal = Effect.fn("ProviderReactor.ingestSignal")(function* (
  dispatchInternal: DispatchInternal,
  persisted: PersistedEvent<DomainEvent>,
  runtimeMode: RuntimeMode,
  signal: ProviderSignal,
) {
  const now = yield* DateTime.now
  const command = yield* makeInternalCommand(
    persisted,
    commandForSignal(runtimeMode, signal, DateTime.formatIso(now)),
  )
  yield* dispatchInternal(command)
})

const stopIdleSession = Effect.fn("ProviderReactor.stopIdleSession")(function* (
  dispatchInternal: DispatchInternal,
  persisted: PersistedEvent<DomainEvent>,
  runtimeMode: RuntimeMode,
  threadId: ThreadId,
  turnId: TurnId,
  resumeCursor: ResumeCursor | null,
) {
  yield* ingestSignal(dispatchInternal, persisted, runtimeMode, {
    _tag: "session",
    threadId,
    turnId,
    status: "stopped",
    resumeCursor,
  })
})

/** Maps committed Thread intents to Cursor calls and Cursor signals back to durable commands. */
export const makeProviderReactor = (
  dispatchInternal: DispatchInternal,
): Effect.Effect<
  (persisted: PersistedEvent<DomainEvent>) => Effect.Effect<void>,
  never,
  ProviderPort | SqlClient | Crypto.Crypto
> =>
  Effect.gen(function* () {
    const provider = yield* ProviderPort
    const sql = yield* SqlClient
    const crypto = yield* Crypto.Crypto

    return (persisted) => {
      const event = persisted.event
      if (!isThreadEvent(event)) {
        return Effect.void
      }
      const threadEvent = event
      switch (threadEvent._tag) {
        case "thread.turn.started":
          return Effect.gen(function* () {
            const snapshot = yield* readThreadSnapshot(threadEvent.threadId).pipe(
              Effect.provideService(SqlClient, sql),
              Effect.orDie,
            )
            if (Option.isNone(snapshot)) {
              return yield* Effect.die(`Thread ${threadEvent.threadId} projection is missing`)
            }
            const runtimeMode = threadEvent.runtimeMode ?? snapshot.value.thread.runtimeMode
            const workspaceRoot = yield* projectRoot(persisted.projectId).pipe(
              Effect.provideService(SqlClient, sql),
            )
            yield* provider.startTurn(
              {
                threadId: threadEvent.threadId,
                turnId: threadEvent.turnId,
                text: threadEvent.text,
                workspaceRoot,
                runtimeMode,
                resumeCursor: snapshot.value.session?.resumeCursor ?? null,
              },
              (signal) =>
                ingestSignal(dispatchInternal, persisted, runtimeMode, signal).pipe(
                  Effect.provideService(SqlClient, sql),
                  Effect.provideService(Crypto.Crypto, crypto),
                ),
            )
          })
        case "thread.turn.interrupted":
          return provider.interrupt(threadEvent.threadId)
        case "session.stop-requested":
          return Effect.gen(function* () {
            const snapshot = yield* readThreadSnapshot(threadEvent.threadId).pipe(
              Effect.provideService(SqlClient, sql),
              Effect.orDie,
            )
            if (Option.isNone(snapshot) || snapshot.value.session === null) {
              return
            }
            if (
              snapshot.value.session.status === "starting" ||
              snapshot.value.session.status === "running"
            ) {
              yield* provider.stop(threadEvent.threadId)
              return
            }
            const latestTurn = snapshot.value.thread.latestTurn
            if (latestTurn !== null) {
              yield* stopIdleSession(
                dispatchInternal,
                persisted,
                snapshot.value.thread.runtimeMode,
                threadEvent.threadId,
                latestTurn.turnId,
                snapshot.value.session.resumeCursor,
              ).pipe(
                Effect.provideService(SqlClient, sql),
                Effect.provideService(Crypto.Crypto, crypto),
              )
            }
          })
        case "approval.responded":
          return provider.respondApproval(
            threadEvent.threadId,
            threadEvent.requestId,
            threadEvent.decision,
          )
        case "user-input.responded":
          return provider.respondUserInput(
            threadEvent.threadId,
            threadEvent.requestId,
            threadEvent.answers,
          )
        default:
          return Effect.void
      }
    }
  })
