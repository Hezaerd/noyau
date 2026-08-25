import type { PersistedEvent } from "@noyau/database/command-worker"
import { readThreadSnapshot } from "@noyau/database/snapshots"
import { type InternalCommand as InternalCommandType } from "@noyau/protocol/commands"
import type { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import { checkpointRefForTurn, type TurnDiffFile } from "@noyau/protocol/entities/turn"
import type { DomainEvent } from "@noyau/protocol/events"
import {
  ActorId,
  CommandId,
  CorrelationId,
  EventId,
  ProjectId,
  type ThreadId,
} from "@noyau/protocol/ids"
import { ThreadTurnDiffComplete } from "@noyau/protocol/thread/commands"
import { ThreadEvent } from "@noyau/protocol/thread/events"
import { Crypto, DateTime, Effect, Option, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

import { GitRuntime } from "./git-runtime.ts"
import {
  parseTurnDiffNumstat,
  shouldCaptureBaselineOnTurnStarted,
  turnDiffStatusFromSettlement,
} from "./turn-diff.ts"

const ProjectRootRow = Schema.Struct({ workspace_root: Schema.NonEmptyString })
const decodeProjectRootRow = Schema.decodeEffect(ProjectRootRow)
const decodeTurnDiffComplete = Schema.decodeUnknownEffect(ThreadTurnDiffComplete)
const systemActor = ActorId.make("system:checkpoint")
const isThreadEvent = Schema.is(ThreadEvent)

export type DispatchInternal = (command: InternalCommandType) => Effect.Effect<void>

const projectRoot = Effect.fn("TurnDiffReactor.projectRoot")(function* (projectId: string) {
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

const resolveCwd = (worktreePath: string | null | undefined, workspaceRoot: string): string =>
  worktreePath !== null && worktreePath !== undefined && worktreePath.length > 0
    ? worktreePath
    : workspaceRoot

export const makeTurnDiffReactor = (
  dispatchInternal: DispatchInternal,
): Effect.Effect<
  (persisted: PersistedEvent<DomainEvent>) => Effect.Effect<void>,
  never,
  GitRuntime | SqlClient | Crypto.Crypto
> =>
  Effect.gen(function* () {
    const git = yield* GitRuntime
    const sql = yield* SqlClient
    const crypto = yield* Crypto.Crypto

    const loadSnapshot = (threadId: ThreadId) =>
      readThreadSnapshot(threadId).pipe(Effect.provideService(SqlClient, sql), Effect.orDie)

    const ensureCheckpoint = (cwd: string, checkpointRef: string) =>
      git
        .hasCheckpointRef({ cwd, checkpointRef })
        .pipe(
          Effect.flatMap((exists) =>
            exists ? Effect.void : git.captureCheckpoint({ cwd, checkpointRef }),
          ),
        )

    const dispatchComplete = Effect.fn("TurnDiffReactor.dispatchComplete")(function* (input: {
      readonly persisted: PersistedEvent<DomainEvent>
      readonly threadId: ThreadId
      readonly turnId: (typeof ThreadTurnDiffComplete.Type)["payload"]["turnId"]
      readonly checkpointRef: string
      readonly status: (typeof ThreadTurnDiffComplete.Type)["payload"]["status"]
      readonly files: ReadonlyArray<TurnDiffFile>
    }) {
      const commandId = yield* crypto.randomUUIDv4.pipe(Effect.orDie)
      const issuedAt = yield* DateTime.now
      const command = yield* decodeTurnDiffComplete({
        _tag: "thread.turn.diff.complete",
        commandId: CommandId.make(commandId),
        projectId: ProjectId.make(input.persisted.projectId),
        actorId: systemActor,
        correlationId: CorrelationId.make(input.persisted.correlationId),
        causationId: EventId.make(input.persisted.eventId),
        issuedAt: DateTime.formatIso(issuedAt),
        schemaVersion: 1,
        payload: {
          threadId: input.threadId,
          turnId: input.turnId,
          checkpointRef: input.checkpointRef,
          status: input.status,
          files: input.files,
        },
      }).pipe(Effect.orDie)
      yield* dispatchInternal(command)
    })

    const captureBaseline = Effect.fn("TurnDiffReactor.captureBaseline")(function* (input: {
      readonly threadId: ThreadId
      readonly projectId: string
      readonly snapshot: ThreadSnapshot
    }) {
      const latest = input.snapshot.turns.at(-1)
      if (latest === undefined) {
        return
      }
      const workspaceRoot = yield* projectRoot(input.projectId).pipe(
        Effect.provideService(SqlClient, sql),
      )
      const cwd = resolveCwd(input.snapshot.thread.worktreePath, workspaceRoot)
      const isRepo = yield* git.isGitRepository(cwd)
      if (!isRepo) {
        return
      }
      const baseline = checkpointRefForTurn(input.threadId, latest.ordinal - 1)
      yield* ensureCheckpoint(cwd, baseline)
    })

    const finalizeTurn = Effect.fn("TurnDiffReactor.finalizeTurn")(function* (input: {
      readonly persisted: PersistedEvent<DomainEvent>
      readonly threadId: ThreadId
      readonly turnId: (typeof ThreadTurnDiffComplete.Type)["payload"]["turnId"]
      readonly status: (typeof ThreadTurnDiffComplete.Type)["payload"]["status"]
    }) {
      const snapshot = yield* loadSnapshot(input.threadId)
      if (Option.isNone(snapshot)) {
        return
      }
      const turn = snapshot.value.turns.find((candidate) => candidate.id === input.turnId)
      if (turn === undefined) {
        return
      }
      const workspaceRoot = yield* projectRoot(input.persisted.projectId).pipe(
        Effect.provideService(SqlClient, sql),
      )
      const cwd = resolveCwd(snapshot.value.thread.worktreePath, workspaceRoot)
      const isRepo = yield* git.isGitRepository(cwd)
      if (!isRepo) {
        return
      }
      const baseline = checkpointRefForTurn(input.threadId, turn.ordinal - 1)
      const target = checkpointRefForTurn(input.threadId, turn.ordinal)
      const captured = yield* ensureCheckpoint(cwd, baseline).pipe(
        Effect.andThen(git.captureCheckpoint({ cwd, checkpointRef: target })),
        Effect.andThen(
          git.diffCheckpoints({
            cwd,
            fromCheckpointRef: baseline,
            toCheckpointRef: target,
          }),
        ),
        Effect.map((stdout) => ({
          status: input.status,
          files: parseTurnDiffNumstat(stdout),
        })),
        Effect.catch((error) =>
          Effect.logWarning("turn diff capture failed", {
            threadId: input.threadId,
            turnId: input.turnId,
            detail: error.detail,
          }).pipe(
            Effect.as<{
              readonly status: (typeof ThreadTurnDiffComplete.Type)["payload"]["status"]
              readonly files: ReadonlyArray<TurnDiffFile>
            }>({
              status: input.status === "ready" ? "error" : input.status,
              files: [],
            }),
          ),
        ),
      )
      yield* dispatchComplete({
        persisted: input.persisted,
        threadId: input.threadId,
        turnId: input.turnId,
        checkpointRef: target,
        status: captured.status,
        files: captured.files,
      })
    })

    return (persisted) => {
      const event = persisted.event
      if (!isThreadEvent(event)) {
        return Effect.void
      }
      switch (event._tag) {
        case "thread.turn.started":
          return Effect.gen(function* () {
            const snapshot = yield* loadSnapshot(event.threadId)
            if (Option.isNone(snapshot)) {
              return
            }
            if (
              !shouldCaptureBaselineOnTurnStarted({
                prepareWorktree: event.prepareWorktree !== undefined,
                worktreePath: snapshot.value.thread.worktreePath ?? null,
              })
            ) {
              return
            }
            yield* captureBaseline({
              threadId: event.threadId,
              projectId: persisted.projectId,
              snapshot: snapshot.value,
            })
          }).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("turn diff baseline skipped", { cause }),
            ),
          )
        case "thread.meta-updated":
          return event.worktreePath === undefined
            ? Effect.void
            : Effect.gen(function* () {
                const snapshot = yield* loadSnapshot(event.threadId)
                if (Option.isNone(snapshot)) {
                  return
                }
                const latest = snapshot.value.turns.at(-1)
                if (latest === undefined || latest.state !== "running") {
                  return
                }
                yield* captureBaseline({
                  threadId: event.threadId,
                  projectId: persisted.projectId,
                  snapshot: snapshot.value,
                })
              }).pipe(
                Effect.catchCause((cause) =>
                  Effect.logWarning("turn diff baseline after worktree bind skipped", { cause }),
                ),
              )
        case "thread.turn.ended":
          return finalizeTurn({
            persisted,
            threadId: event.threadId,
            turnId: event.turnId,
            status: turnDiffStatusFromSettlement(event.state),
          }).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("turn diff finalize skipped", { cause }),
            ),
          )
        default:
          return Effect.void
      }
    }
  })
