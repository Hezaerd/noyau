import {
  InternalCommand,
  type InternalCommand as InternalCommandType,
} from "@noyau/contracts/commands"
import type { TurnImageAttachment } from "@noyau/contracts/entities/attachment"
import { ProviderInstanceId } from "@noyau/contracts/entities/environment"
import { ModelSelection } from "@noyau/contracts/entities/model-selection"
import { RuntimeMode } from "@noyau/contracts/entities/runtime-mode"
import { ResumeCursor } from "@noyau/contracts/entities/session"
import { TranscriptItem } from "@noyau/contracts/entities/transcript"
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
import { resolveProviderHandoffPrompt, resolveProviderTurnPrompt } from "./undelivered-mandate.ts"

const ProjectRootRow = Schema.Struct({ workspace_root: Schema.NonEmptyString })
const ProviderTurnContextRow = Schema.Struct({
  provider: ProviderInstanceId,
  runtime_mode: RuntimeMode,
  model_id: Schema.NullOr(Schema.NonEmptyString),
  reasoning_effort: Schema.NullOr(Schema.NonEmptyString),
  service_tier: Schema.NullOr(Schema.NonEmptyString),
  thinking: Schema.NullOr(Schema.Int),
  worktree_path: Schema.NullOr(Schema.String),
  resume_cursor: Schema.NullOr(Schema.String),
})
const ProviderTranscriptRow = Schema.Struct({ item: Schema.String })
const decodeProjectRootRow = Schema.decodeEffect(ProjectRootRow)
const decodeProviderTurnContextRow = Schema.decodeEffect(ProviderTurnContextRow)
const decodeResumeCursor = Schema.decodeEffect(Schema.fromJsonString(ResumeCursor))
const decodeProviderTranscriptRow = Schema.decodeEffect(ProviderTranscriptRow)
const decodeTranscriptItem = Schema.decodeEffect(Schema.fromJsonString(TranscriptItem))
const decodeModelSelection = Schema.decodeUnknownEffect(ModelSelection)
const decodeInternalCommand = Schema.decodeUnknownEffect(InternalCommand)
const decodeThreadMetaUpdate = Schema.decodeUnknownEffect(ThreadMetaUpdate)
const systemActor = ActorId.make("system:cursor")
const isThreadEvent = Schema.is(ThreadEvent)

const modelSelectionFromTurnContext = Effect.fn("ProviderReactor.modelSelectionFromTurnContext")(
  function* (row: (typeof ProviderTurnContextRow)["Type"]) {
    if (row.model_id === null) return null
    const selection: ModelSelection = { modelId: row.model_id }
    if (row.reasoning_effort !== null)
      Object.assign(selection, { reasoningEffort: row.reasoning_effort })
    if (row.service_tier !== null) Object.assign(selection, { serviceTier: row.service_tier })
    if (row.thinking !== null) Object.assign(selection, { thinking: row.thinking === 1 })
    return yield* decodeModelSelection(selection).pipe(Effect.orDie)
  },
)

const readProviderTurnContext = Effect.fn("ProviderReactor.readProviderTurnContext")(function* (
  threadId: ThreadId,
  forceTranscript: boolean,
) {
  const sql = yield* SqlClient
  return yield* sql.withTransaction(
    Effect.gen(function* () {
      const rows = yield* sql<(typeof ProviderTurnContextRow)["Encoded"]>`
        SELECT
          thread.provider, thread.runtime_mode, thread.model_id, thread.reasoning_effort,
          thread.service_tier, thread.thinking, thread.worktree_path, session.resume_cursor
        FROM projection_threads AS thread
        LEFT JOIN projection_sessions AS session ON session.thread_id = thread.thread_id
        WHERE thread.thread_id = ${threadId}
      `
      const raw = rows[0]
      if (raw === undefined) return Option.none()
      const row = yield* decodeProviderTurnContextRow(raw).pipe(Effect.orDie)
      const transcript =
        forceTranscript || row.resume_cursor === null
          ? yield* Effect.forEach(
              yield* sql<(typeof ProviderTranscriptRow)["Encoded"]>`
              SELECT item FROM projection_transcript WHERE thread_id = ${threadId} ORDER BY ordinal
            `,
              (rawItem) =>
                decodeProviderTranscriptRow(rawItem).pipe(
                  Effect.orDie,
                  Effect.flatMap((item) => decodeTranscriptItem(item.item).pipe(Effect.orDie)),
                ),
            )
          : []
      return Option.some({
        provider: row.provider,
        runtimeMode: row.runtime_mode,
        modelSelection: yield* modelSelectionFromTurnContext(row),
        worktreePath: row.worktree_path,
        resumeCursor:
          row.resume_cursor === null
            ? null
            : yield* decodeResumeCursor(row.resume_cursor).pipe(Effect.orDie),
        transcript,
      })
    }),
  )
})

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
      Extract<InternalCommandEncoded, { readonly _tag: "thread.fork.complete" }>,
      "_tag" | "payload"
    >
  | Pick<Extract<InternalCommandEncoded, { readonly _tag: "thread.fork.fail" }>, "_tag" | "payload">
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
  | Pick<
      Extract<InternalCommandEncoded, { readonly _tag: "user-input.detach" }>,
      "_tag" | "payload"
    >
  | Pick<
      Extract<InternalCommandEncoded, { readonly _tag: "user-input.cancel" }>,
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
      const payload = {
        threadId: signal.threadId,
        turnId: signal.turnId,
        state: signal.state,
      }
      if (signal.lastError !== undefined) Object.assign(payload, { lastError: signal.lastError })
      if (signal.forkPoint !== undefined) {
        Object.assign(payload, { providerForkPoint: signal.forkPoint })
      }
      return { _tag: "thread.turn.ended", payload }
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
    case "user-input-detached":
      return {
        _tag: "user-input.detach",
        payload: { threadId: signal.threadId, requestId: signal.requestId },
      }
    case "user-input-cancelled":
      return {
        _tag: "user-input.cancel",
        payload: { threadId: signal.threadId, requestId: signal.requestId },
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
    const activeTurns = new Map<ThreadId, Pick<ProviderTurnInput, "provider" | "turnId">>()

    return (persisted) => {
      const event = persisted.event
      if (!isThreadEvent(event)) {
        return Effect.void
      }
      const threadEvent = event
      switch (threadEvent._tag) {
        case "thread.fork-requested":
          return Effect.gen(function* () {
            const source = yield* readThreadSnapshot(threadEvent.sourceThreadId).pipe(
              Effect.provideService(SqlClient, sql),
              Effect.orDie,
            )
            if (Option.isNone(source)) return
            const sourceTurn = source.value.turns.find(
              (turn) => turn.id === threadEvent.sourceTurnId,
            )
            const resumeCursor = source.value.session?.resumeCursor
            const point = sourceTurn?.providerForkPoint
            const fork = provider.fork
            const workspaceRoot =
              source.value.thread.worktreePath ??
              (yield* projectRoot(persisted.projectId).pipe(Effect.provideService(SqlClient, sql)))
            const body =
              resumeCursor === null ||
              resumeCursor === undefined ||
              point === undefined ||
              fork === undefined
                ? {
                    _tag: "thread.fork.fail" as const,
                    payload: {
                      threadId: threadEvent.threadId,
                      sourceThreadId: threadEvent.sourceThreadId,
                      sourceTurnId: threadEvent.sourceTurnId,
                      detail: "The selected response has no native provider fork boundary.",
                    },
                  }
                : yield* fork({
                    projectId: source.value.thread.projectId,
                    threadId: threadEvent.threadId,
                    sourceThreadId: threadEvent.sourceThreadId,
                    sourceTurnId: threadEvent.sourceTurnId,
                    provider: source.value.thread.provider,
                    workspaceRoot,
                    sourceResumeCursor: resumeCursor,
                    sourceForkPoint: point,
                  }).pipe(
                    Effect.map((nextCursor) => ({
                      _tag: "thread.fork.complete" as const,
                      payload: {
                        threadId: threadEvent.threadId,
                        sourceThreadId: threadEvent.sourceThreadId,
                        sourceTurnId: threadEvent.sourceTurnId,
                        resumeCursor: nextCursor,
                        providerForkPoint: point,
                      },
                    })),
                    Effect.catch((error) =>
                      Effect.succeed({
                        _tag: "thread.fork.fail" as const,
                        payload: {
                          threadId: threadEvent.threadId,
                          sourceThreadId: threadEvent.sourceThreadId,
                          sourceTurnId: threadEvent.sourceTurnId,
                          detail: error.message,
                        },
                      }),
                    ),
                  )
            const command = yield* makeInternalCommand(persisted, body).pipe(
              Effect.provideService(SqlClient, sql),
              Effect.provideService(Crypto.Crypto, crypto),
            )
            yield* dispatchInternal(command)
          })
        case "thread.turn.started":
          return Effect.gen(function* () {
            const context = yield* readProviderTurnContext(
              threadEvent.threadId,
              threadEvent.providerHandoff !== undefined,
            ).pipe(Effect.provideService(SqlClient, sql), Effect.orDie)
            if (Option.isNone(context)) {
              return yield* Effect.die(`Thread ${threadEvent.threadId} projection is missing`)
            }
            const turnContext = context.value
            const turnProvider = threadEvent.providerHandoff?.provider ?? turnContext.provider
            activeTurns.set(threadEvent.threadId, {
              provider: turnProvider,
              turnId: threadEvent.turnId,
            })
            const runtimeMode = threadEvent.runtimeMode ?? turnContext.runtimeMode
            const workspaceRoot = yield* projectRoot(persisted.projectId).pipe(
              Effect.provideService(SqlClient, sql),
            )
            let cwd = turnContext.worktreePath ?? workspaceRoot
            const prepare = threadEvent.prepareWorktree
            if (prepare !== undefined && turnContext.worktreePath == null) {
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
            if (threadEvent.providerHandoff !== undefined) {
              yield* provider.stop(threadEvent.threadId)
            }
            const resumeCursor =
              threadEvent.providerHandoff === undefined ? turnContext.resumeCursor : null
            const mandate =
              threadEvent.providerHandoff === undefined
                ? resolveProviderTurnPrompt({
                    resumeCursor,
                    currentText: threadEvent.text ?? "",
                    currentAttachments: threadEvent.attachments,
                    currentTurnId: threadEvent.turnId,
                    transcript: turnContext.transcript,
                  })
                : resolveProviderHandoffPrompt({
                    handoff: threadEvent.providerHandoff,
                    currentText: threadEvent.text ?? "",
                    currentAttachments: threadEvent.attachments,
                    currentTurnId: threadEvent.turnId,
                    transcript: turnContext.transcript,
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
              provider: turnProvider,
              text: mandate.text,
              workspaceRoot: cwd,
              runtimeMode,
              modelSelection: turnContext.modelSelection,
              resumeCursor,
            }
            if (attachments !== undefined) {
              turnInput = Object.assign({}, turnInput, { attachments: attachments.success })
            }
            if (Option.isSome(board)) {
              turnInput = Object.assign({}, turnInput, {
                tickets: promptTicketsFromBoard(board.value),
              })
            }
            yield* provider.startTurn(turnInput, (signal) => {
              const active = activeTurns.get(turnInput.threadId)
              return active?.provider !== turnInput.provider || active.turnId !== turnInput.turnId
                ? Effect.void
                : ingestSignal(dispatchInternal, persisted, runtimeMode, signal).pipe(
                    Effect.provideService(SqlClient, sql),
                    Effect.provideService(Crypto.Crypto, crypto),
                  )
            })
          })
        case "thread.turn.interrupted":
          return provider.interrupt(threadEvent.threadId)
        case "thread.deleted":
          activeTurns.delete(threadEvent.threadId)
          return provider.stop(threadEvent.threadId)
        case "thread.provider-handed-off":
          activeTurns.delete(threadEvent.threadId)
          return Effect.void
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
