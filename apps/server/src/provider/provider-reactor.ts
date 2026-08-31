import {
  InternalCommand,
  type InternalCommand as InternalCommandType,
} from "@noyau/contracts/commands"
import type { TurnImageAttachment } from "@noyau/contracts/entities/attachment"
import type { RuntimeMode } from "@noyau/contracts/entities/runtime-mode"
import type { ResumeCursor } from "@noyau/contracts/entities/session"
import type { ServiceUnavailable } from "@noyau/contracts/errors"
import type { DomainEvent } from "@noyau/contracts/events"
import {
  ActorId,
  CommandId,
  CorrelationId,
  EventId,
  ProjectId,
  type ThreadId,
  type TurnId,
} from "@noyau/contracts/ids"
import { ThreadMetaUpdate } from "@noyau/contracts/thread/commands"
import { ThreadEvent } from "@noyau/contracts/thread/events"
import { ServerConfig } from "@noyau/server/config"
import { buildTemporaryWorktreeBranchName, GitRuntime } from "@noyau/server/git/git-runtime"
import type { PersistedEvent } from "@noyau/server/persistence/command-worker"
import { readBoardSnapshot, readThreadSnapshot } from "@noyau/server/persistence/snapshots"
import { Crypto, DateTime, Effect, Option, Result, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

import { promptTicketsFromBoard } from "./prompt-blocks.ts"
import {
  ProviderPort,
  type ProviderSignal,
  type ProviderTurnAttachment,
  type ProviderTurnInput,
} from "./provider-port.ts"
import { resolveProviderTurnPrompt } from "./undelivered-mandate.ts"

const ProjectRootRow = Schema.Struct({ workspace_root: Schema.NonEmptyString })
const decodeProjectRootRow = Schema.decodeEffect(ProjectRootRow)
const decodeInternalCommand = Schema.decodeUnknownEffect(InternalCommand)
const decodeThreadMetaUpdate = Schema.decodeUnknownEffect(ThreadMetaUpdate)
const systemActor = ActorId.make("system:cursor")
const isThreadEvent = Schema.is(ThreadEvent)

export type DispatchInternal = (
  command: InternalCommandType | (typeof ThreadMetaUpdate)["Type"],
) => Effect.Effect<void>

export type LoadTurnAttachments = (
  attachments: ReadonlyArray<TurnImageAttachment>,
) => Effect.Effect<ReadonlyArray<ProviderTurnAttachment>, ServiceUnavailable>
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
  | Pick<
      Extract<InternalCommandEncoded, { readonly _tag: "thread.context-usage.set" }>,
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
    case "context-usage":
      return {
        _tag: "thread.context-usage.set",
        payload: {
          threadId: signal.threadId,
          contextUsage: {
            used: signal.used,
            window: signal.window,
          },
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
  loadAttachments: LoadTurnAttachments,
): Effect.Effect<
  (persisted: PersistedEvent<DomainEvent>) => Effect.Effect<void>,
  never,
  ProviderPort | SqlClient | Crypto.Crypto | GitRuntime | ServerConfig
> =>
  Effect.gen(function* () {
    const provider = yield* ProviderPort
    const sql = yield* SqlClient
    const crypto = yield* Crypto.Crypto
    const git = yield* GitRuntime
    const config = yield* ServerConfig

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
            let cwd = snapshot.value.thread.worktreePath ?? workspaceRoot
            const prepare = threadEvent.prepareWorktree
            if (prepare !== undefined && snapshot.value.thread.worktreePath == null) {
              const branch =
                prepare.branch ??
                buildTemporaryWorktreeBranchName(yield* crypto.randomUUIDv4.pipe(Effect.orDie))
              const created = yield* git
                .createWorktree(
                  Object.assign(
                    {
                      cwd: workspaceRoot,
                      worktreesDir: config.worktreesDir,
                      baseBranch: prepare.baseBranch,
                      branch,
                    },
                    prepare.startFromOrigin === undefined
                      ? {}
                      : { startFromOrigin: prepare.startFromOrigin },
                  ),
                )
                .pipe(Effect.result)
              if (created._tag === "Failure") {
                yield* ingestSignal(dispatchInternal, persisted, runtimeMode, {
                  _tag: "turn-ended",
                  threadId: threadEvent.threadId,
                  turnId: threadEvent.turnId,
                  state: "error",
                  lastError: created.failure.detail,
                }).pipe(
                  Effect.provideService(SqlClient, sql),
                  Effect.provideService(Crypto.Crypto, crypto),
                )
                return
              }
              cwd = created.success.worktree.path
              const issuedAt = yield* DateTime.now
              const commandId = yield* crypto.randomUUIDv4.pipe(Effect.orDie)
              const bind = yield* decodeThreadMetaUpdate({
                _tag: "thread.meta.update",
                commandId: CommandId.make(commandId),
                projectId: ProjectId.make(persisted.projectId),
                actorId: systemActor,
                correlationId: CorrelationId.make(persisted.correlationId),
                causationId: EventId.make(persisted.eventId),
                issuedAt: DateTime.formatIso(issuedAt),
                schemaVersion: 1,
                payload: {
                  threadId: threadEvent.threadId,
                  branch: created.success.worktree.refName,
                  worktreePath: created.success.worktree.path,
                },
              }).pipe(Effect.orDie)
              yield* dispatchInternal(bind)
            }
            const mandate = resolveProviderTurnPrompt({
              resumeCursor: snapshot.value.session?.resumeCursor ?? null,
              currentText: threadEvent.text ?? "",
              currentAttachments: threadEvent.attachments,
              currentTurnId: threadEvent.turnId,
              transcript: snapshot.value.transcript,
            })
            const attachments =
              mandate.attachments === undefined
                ? undefined
                : yield* loadAttachments(mandate.attachments).pipe(Effect.result)
            if (attachments !== undefined && Result.isFailure(attachments)) {
              yield* ingestSignal(dispatchInternal, persisted, runtimeMode, {
                _tag: "turn-ended",
                threadId: threadEvent.threadId,
                turnId: threadEvent.turnId,
                state: "error",
                lastError: "Unreadable attachment.",
              }).pipe(
                Effect.provideService(SqlClient, sql),
                Effect.provideService(Crypto.Crypto, crypto),
              )
              return
            }
            const board = yield* readBoardSnapshot(ProjectId.make(persisted.projectId)).pipe(
              Effect.provideService(SqlClient, sql),
              Effect.orDie,
            )
            let turnInput: ProviderTurnInput = {
              projectId: ProjectId.make(persisted.projectId),
              threadId: threadEvent.threadId,
              turnId: threadEvent.turnId,
              provider: snapshot.value.thread.provider,
              text: mandate.text,
              workspaceRoot: cwd,
              runtimeMode,
              modelSelection: snapshot.value.thread.modelSelection,
              resumeCursor: snapshot.value.session?.resumeCursor ?? null,
            }
            if (attachments !== undefined) {
              turnInput = Object.assign({}, turnInput, { attachments: attachments.success })
            }
            if (Option.isSome(board)) {
              turnInput = Object.assign({}, turnInput, {
                tickets: promptTicketsFromBoard(board.value),
              })
            }
            yield* provider.startTurn(turnInput, (signal) =>
              ingestSignal(dispatchInternal, persisted, runtimeMode, signal).pipe(
                Effect.provideService(SqlClient, sql),
                Effect.provideService(Crypto.Crypto, crypto),
              ),
            )
          })
        case "thread.turn.interrupted":
          return provider.interrupt(threadEvent.threadId)
        case "thread.deleted":
          return provider.stop(threadEvent.threadId)
        case "session.stop-requested":
          return Effect.gen(function* () {
            const snapshot = yield* readThreadSnapshot(threadEvent.threadId).pipe(
              Effect.provideService(SqlClient, sql),
              Effect.orDie,
            )
            if (Option.isNone(snapshot) || snapshot.value.session === null) {
              return
            }
            yield* provider.stop(threadEvent.threadId)
            // A stopped Session projection survives a Server restart with no in-memory runtime,
            // so the adapter cannot emit a signal in that case. Persist the explicit stop for idle
            // projections while active Turns remain responsible for their own settlement signal.
            if (
              snapshot.value.session.status !== "starting" &&
              snapshot.value.session.status !== "running" &&
              snapshot.value.session.status !== "stopped"
            ) {
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
