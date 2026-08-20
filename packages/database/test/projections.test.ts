import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { assert, describe, it } from "@effect/vitest"
import { makeCommandWorker, type PersistedEvent } from "@noyau/database/command-worker"
import { makeDrainableWorker } from "@noyau/database/drainable-worker"
import { findWorkspaceRootOwner, projectDomainEvent } from "@noyau/database/projections"
import { readBoardSnapshot, readShellSnapshot, readThreadSnapshot } from "@noyau/database/snapshots"
import { layer as sqliteLayer } from "@noyau/database/sqlite"
import { decide } from "@noyau/domain/board/decider"
import { emptyBoardState, evolve } from "@noyau/domain/board/projector"
import { BoardSnapshot } from "@noyau/protocol/board"
import { Environment, WorkspaceRoot } from "@noyau/protocol/entities/environment"
import { Session } from "@noyau/protocol/entities/session"
import { type DomainEvent } from "@noyau/protocol/events"
import { ActorId, CommandId, CorrelationId, ProjectId, ThreadId, TurnId } from "@noyau/protocol/ids"
import { ProjectCreated } from "@noyau/protocol/project/events"
import {
  ThreadCreated,
  ThreadSessionSet,
  ThreadTranscriptAppended,
  ThreadTurnStarted,
} from "@noyau/protocol/thread/events"
import { TicketCommand } from "@noyau/protocol/ticket/commands"
import { TicketRejection } from "@noyau/protocol/ticket/errors"
import { TicketEvent } from "@noyau/protocol/ticket/events"
import { Context, Crypto, Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

const ids = {
  project: Schema.decodeSync(ProjectId)("10000000-0000-4000-8000-000000000001"),
  recoveryThread: Schema.decodeSync(ThreadId)("20000000-0000-4000-8000-000000000001"),
  terminalThread: Schema.decodeSync(ThreadId)("20000000-0000-4000-8000-000000000002"),
  actor: Schema.decodeSync(ActorId)("human:test"),
}
const workspaceRoot = Schema.decodeSync(WorkspaceRoot)("/workspace")

const occurredAt = (iso: string) => Schema.decodeSync(Schema.DateTimeUtcFromString)(iso)
const encodeBoardSnapshot = Schema.encodeEffect(BoardSnapshot)
const environment = Schema.decodeSync(Environment)({
  id: "90000000-0000-4000-8000-000000000001",
  cursor: { installed: true, handshakeOk: true },
  createdAt: "2026-08-20T00:00:00.000Z",
})

const persisted = (
  sequence: number,
  event: DomainEvent,
  at = "2026-08-20T00:00:00.000Z",
): PersistedEvent<DomainEvent> => ({
  eventId: `event-${sequence}`,
  sequence,
  projectId: ids.project,
  actorId: ids.actor,
  correlationId: "30000000-0000-4000-8000-000000000001",
  causationId: "40000000-0000-4000-8000-000000000001",
  occurredAt: occurredAt(at),
  schemaVersion: 1,
  aggregate: { kind: "fixture", id: ids.project },
  aggregateVersion: sequence,
  event,
})

const testCrypto = () => {
  let counter = 0
  return Crypto.make({
    randomBytes: (size) => {
      const bytes = new Uint8Array(size)
      counter = counter + 1
      bytes[size - 1] = counter % 256
      return bytes
    },
    digest: (_algorithm, data) => Effect.succeed(data),
  })
}

const command = (input: (typeof TicketCommand)["Encoded"]) =>
  Schema.decodeSync(TicketCommand)(input)

const commandMeta = (commandId: string, issuedAt: string) => ({
  commandId: Schema.decodeSync(CommandId)(commandId),
  projectId: ids.project,
  actorId: ids.actor,
  correlationId: Schema.decodeSync(CorrelationId)(commandId),
  issuedAt,
  schemaVersion: 1 as const,
})

const projectFixture = () =>
  projectDomainEvent(
    persisted(
      0,
      ProjectCreated.make({
        projectId: ids.project,
        name: "Noyau",
        workspaceRoot,
      }),
    ),
  )

const expectSome = <A>(option: Option.Option<A>, message: string): A => {
  assert.isTrue(Option.isSome(option), message)
  return Option.getOrThrow(option)
}

describe("SQL projections", () => {
  it.effect("résout le propriétaire durable d'un WorkspaceRoot avec exclusion de rebind", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* Layer.build(sqliteLayer({ filename: ":memory:" }))
        const sql = Context.get(context, SqlClient)
        return yield* Effect.gen(function* () {
          yield* projectFixture()
          const owner = yield* findWorkspaceRootOwner(workspaceRoot)
          const excluded = yield* findWorkspaceRootOwner(workspaceRoot, ids.project)

          assert.deepStrictEqual(owner, Option.some(ids.project))
          assert.deepStrictEqual(excluded, Option.none())
        }).pipe(Effect.provideService(SqlClient, sql))
      }),
    ),
  )

  it.effect("persiste une commande Board et restitue le même snapshot après recréation", () => {
    const directory = mkdtempSync(join(tmpdir(), "noyau-board-projection-"))
    const filename = join(directory, "state.sqlite")

    return Effect.gen(function* () {
      const before = yield* Effect.scoped(
        Effect.gen(function* () {
          const context = yield* Layer.build(sqliteLayer({ filename }))
          const sql = Context.get(context, SqlClient)
          return yield* Effect.gen(function* () {
            yield* projectFixture()
            const reactor = yield* makeDrainableWorker(
              (_event: PersistedEvent<(typeof TicketEvent)["Type"]>) => Effect.void,
            )
            const worker = yield* makeCommandWorker({
              commandSchema: TicketCommand,
              eventSchema: TicketEvent,
              rejectionSchema: TicketRejection,
              metadata: (input) => input,
              aggregate: (input) => ({ kind: "board", id: input.projectId }),
              initialState: () => emptyBoardState,
              decide,
              evolve,
              project: (event) => projectDomainEvent(event),
              reactor,
            })
            const initialized = command({
              _tag: "board.initialize",
              ...commandMeta("50000000-0000-4000-8000-000000000001", "2026-08-20T00:01:00.000Z"),
              payload: {
                backlogColumnId: "60000000-0000-4000-8000-000000000001",
                activeColumnId: "60000000-0000-4000-8000-000000000002",
                doneColumnId: "60000000-0000-4000-8000-000000000003",
              },
            })
            const created = command({
              _tag: "ticket.create",
              ...commandMeta("50000000-0000-4000-8000-000000000002", "2026-08-20T00:02:00.000Z"),
              payload: {
                projectId: ids.project,
                ticketId: "70000000-0000-4000-8000-000000000001",
                title: "Persist projections",
                placement: { columnId: "60000000-0000-4000-8000-000000000001" },
              },
            })
            yield* worker.dispatch(initialized)
            yield* worker.dispatch(created)
            const snapshot = expectSome(yield* readBoardSnapshot(ids.project), "Board should exist")
            assert.strictEqual(snapshot.snapshotSequence, 5)
            assert.strictEqual(snapshot.columns.length, 3)
            assert.strictEqual(snapshot.tickets.length, 1)
            return yield* encodeBoardSnapshot(snapshot)
          }).pipe(
            Effect.provideService(SqlClient, sql),
            Effect.provideService(Crypto.Crypto, testCrypto()),
          )
        }),
      )

      const after = yield* Effect.scoped(
        Effect.gen(function* () {
          const context = yield* Layer.build(sqliteLayer({ filename }))
          const sql = Context.get(context, SqlClient)
          return yield* readBoardSnapshot(ids.project).pipe(
            Effect.map((snapshot) => expectSome(snapshot, "reopened Board should exist")),
            Effect.flatMap(encodeBoardSnapshot),
            Effect.provideService(SqlClient, sql),
          )
        }),
      )
      assert.deepStrictEqual(after, before)
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          rmSync(directory, { force: true, recursive: true })
        }),
      ),
    )
  })

  it.effect("récupère les Sessions avant readiness sans réécrire un Turn terminal", () => {
    const directory = mkdtempSync(join(tmpdir(), "noyau-session-recovery-"))
    const filename = join(directory, "state.sqlite")
    const recoveryTurnId = Schema.decodeSync(TurnId)("80000000-0000-4000-8000-000000000001")
    const terminalTurnId = Schema.decodeSync(TurnId)("80000000-0000-4000-8000-000000000002")
    const resumeCursor = { schemaVersion: 1 as const, sessionId: "cursor-session-1" }
    const runningSession = (threadId: ThreadId, activeTurnId: TurnId, updatedAt: string) =>
      Schema.decodeSync(Session)({
        threadId,
        status: "running",
        lastError: null,
        activeTurnId,
        runtimeMode: "full-access",
        resumeCursor,
        updatedAt,
      })
    const readySession = Schema.decodeSync(Session)({
      threadId: ids.terminalThread,
      status: "ready",
      lastError: null,
      activeTurnId: null,
      runtimeMode: "full-access",
      resumeCursor,
      updatedAt: "2026-08-20T00:07:00.000Z",
    })

    return Effect.gen(function* () {
      yield* Effect.scoped(
        Effect.gen(function* () {
          const context = yield* Layer.build(sqliteLayer({ filename }))
          const sql = Context.get(context, SqlClient)
          return yield* Effect.gen(function* () {
            yield* projectFixture()
            yield* projectDomainEvent(
              persisted(
                1,
                ThreadCreated.make({
                  threadId: ids.recoveryThread,
                  projectId: ids.project,
                  title: "Recovery",
                  provider: "cursor",
                  runtimeMode: "full-access",
                }),
              ),
            )
            yield* projectDomainEvent(
              persisted(
                2,
                ThreadTurnStarted.make({
                  threadId: ids.recoveryThread,
                  turnId: recoveryTurnId,
                  text: "Keep this prompt",
                }),
              ),
            )
            yield* projectDomainEvent(
              persisted(
                3,
                ThreadSessionSet.make({
                  threadId: ids.recoveryThread,
                  session: runningSession(
                    ids.recoveryThread,
                    recoveryTurnId,
                    "2026-08-20T00:03:00.000Z",
                  ),
                }),
              ),
            )

            yield* projectDomainEvent(
              persisted(
                4,
                ThreadCreated.make({
                  threadId: ids.terminalThread,
                  projectId: ids.project,
                  title: "Terminal",
                  provider: "cursor",
                  runtimeMode: "full-access",
                }),
              ),
            )
            yield* projectDomainEvent(
              persisted(
                5,
                ThreadTurnStarted.make({
                  threadId: ids.terminalThread,
                  turnId: terminalTurnId,
                  text: "Already done",
                }),
              ),
            )
            yield* projectDomainEvent(
              persisted(
                6,
                ThreadSessionSet.make({
                  threadId: ids.terminalThread,
                  session: runningSession(
                    ids.terminalThread,
                    terminalTurnId,
                    "2026-08-20T00:06:00.000Z",
                  ),
                }),
              ),
            )
            yield* projectDomainEvent(
              persisted(
                7,
                ThreadSessionSet.make({
                  threadId: ids.terminalThread,
                  session: readySession,
                }),
              ),
            )
            yield* projectDomainEvent(
              persisted(
                8,
                ThreadTranscriptAppended.make({
                  item: {
                    _tag: "transcript.assistant",
                    threadId: ids.terminalThread,
                    turnId: terminalTurnId,
                    text: "must be ignored",
                  },
                }),
              ),
            )
            yield* projectDomainEvent(
              persisted(
                9,
                ThreadSessionSet.make({
                  threadId: ids.terminalThread,
                  session: runningSession(
                    ids.terminalThread,
                    terminalTurnId,
                    "2026-08-20T00:09:00.000Z",
                  ),
                }),
              ),
            )
          }).pipe(Effect.provideService(SqlClient, sql))
        }),
      )

      const evidence = yield* Effect.scoped(
        Effect.gen(function* () {
          const context = yield* Layer.build(sqliteLayer({ filename }))
          const sql = Context.get(context, SqlClient)
          return yield* Effect.gen(function* () {
            const recovery = expectSome(
              yield* readThreadSnapshot(ids.recoveryThread),
              "recovery Thread should exist",
            )
            const terminal = expectSome(
              yield* readThreadSnapshot(ids.terminalThread),
              "terminal Thread should exist",
            )
            const shell = yield* readShellSnapshot(environment)
            return { recovery, shell, terminal }
          }).pipe(Effect.provideService(SqlClient, sql))
        }),
      )

      assert.strictEqual(evidence.recovery.session?.status, "error")
      assert.isString(evidence.recovery.session?.lastError)
      assert.deepStrictEqual(evidence.recovery.session?.resumeCursor, resumeCursor)
      assert.strictEqual(evidence.recovery.turns.at(-1)?.state, "error")
      assert.strictEqual(evidence.recovery.thread.latestTurn?.state, "error")
      assert.strictEqual(evidence.terminal.turns.at(-1)?.state, "completed")
      assert.strictEqual(evidence.terminal.thread.latestTurn?.state, "completed")
      assert.strictEqual(evidence.terminal.transcript.length, 1)
      assert.strictEqual(evidence.shell.projects.length, 1)
      assert.strictEqual(evidence.shell.threads.length, 2)
      assert.strictEqual(
        evidence.shell.threads.find((thread) => thread.id === ids.recoveryThread)?.sessionStatus,
        "error",
      )
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          rmSync(directory, { force: true, recursive: true })
        }),
      ),
    )
  })
})
