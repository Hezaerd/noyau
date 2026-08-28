import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, layer } from "@effect/vitest"
import { BoardSnapshot } from "@noyau/contracts/board"
import { Environment, WorkspaceRoot } from "@noyau/contracts/entities/environment"
import { KanbanColumnColor, KanbanRank } from "@noyau/contracts/entities/kanban-column"
import { Session } from "@noyau/contracts/entities/session"
import { type DomainEvent } from "@noyau/contracts/events"
import {
  ActorId,
  ApprovalRequestId,
  CommandId,
  CorrelationId,
  KanbanColumnId,
  ProjectId,
  ThreadId,
  TicketId,
  ToolCallId,
  TurnId,
} from "@noyau/contracts/ids"
import { ProjectCreated, ProjectDeleted } from "@noyau/contracts/project/events"
import {
  ThreadCreated,
  ThreadDeleted,
  ThreadModelSelectionSet,
  ThreadSessionSet,
  ThreadSettled,
  ThreadTranscriptAppended,
  ThreadTurnStarted,
  ThreadUnsettled,
} from "@noyau/contracts/thread/events"
import { TicketCommand } from "@noyau/contracts/ticket/commands"
import { TicketRejection } from "@noyau/contracts/ticket/errors"
import {
  KanbanColumnCreated,
  TicketCompleted,
  TicketCreated,
  TicketEvent,
  TicketThreadLinked,
} from "@noyau/contracts/ticket/events"
import { decide } from "@noyau/server/orchestration/board/decider"
import { emptyBoardState, evolve } from "@noyau/server/orchestration/board/projector"
import { makeCommandWorker, type PersistedEvent } from "@noyau/server/persistence/command-worker"
import { makeDrainableWorker } from "@noyau/server/persistence/drainable-worker"
import { findWorkspaceRootOwner, projectDomainEvent } from "@noyau/server/persistence/projections"
import {
  readBoardSnapshot,
  readShellSnapshot,
  readThreadShellById,
  readThreadSnapshot,
} from "@noyau/server/persistence/snapshots"
import { layer as sqliteLayer } from "@noyau/server/persistence/sqlite"
import { Context, Crypto, DateTime, Effect, FileSystem, Layer, Option, Path, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

const ids = {
  project: Schema.decodeSync(ProjectId)("10000000-0000-4000-8000-000000000001"),
  recoveryThread: Schema.decodeSync(ThreadId)("20000000-0000-4000-8000-000000000001"),
  terminalThread: Schema.decodeSync(ThreadId)("20000000-0000-4000-8000-000000000002"),
  backlog: Schema.decodeSync(KanbanColumnId)("60000000-0000-4000-8000-000000000001"),
  done: Schema.decodeSync(KanbanColumnId)("60000000-0000-4000-8000-000000000003"),
  ticket: Schema.decodeSync(TicketId)("70000000-0000-4000-8000-000000000001"),
  actor: Schema.decodeSync(ActorId)("human:test"),
}
const ranks = {
  backlog: Schema.decodeSync(KanbanRank)("a0"),
  done: Schema.decodeSync(KanbanRank)("a1"),
  ticket: Schema.decodeSync(KanbanRank)("a0"),
}
const columnColor = Schema.decodeSync(KanbanColumnColor)("#737373")
const workspaceRoot = Schema.decodeSync(WorkspaceRoot)("/workspace")
const platformLayer = Layer.mergeAll(NodeFileSystem.layer, Path.layer)

const occurredAt = (iso: string) => Schema.decodeSync(Schema.DateTimeUtcFromString)(iso)
const encodeBoardSnapshot = Schema.encodeEffect(BoardSnapshot)
const environment = Schema.decodeSync(Environment)({
  id: "90000000-0000-4000-8000-000000000001",
  cursor: {
    installed: true,
    handshakeOk: true,
    version: null,
    plan: null,
    binaryPath: null,
  },
  claude: {
    installed: false,
    handshakeOk: false,
    version: null,
    plan: null,
    binaryPath: null,
  },
  codex: {
    installed: false,
    handshakeOk: false,
    version: null,
    plan: null,
    binaryPath: null,
  },
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

layer(platformLayer)("SQL projections", (it) => {
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

  it.effect("prouve create Ticket → move → reload snapshot depuis SQLite", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "noyau-board-projection-",
      })
      const filename = path.join(directory, "state.sqlite")

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
            const moved = command({
              _tag: "ticket.move",
              ...commandMeta("50000000-0000-4000-8000-000000000003", "2026-08-20T00:03:00.000Z"),
              payload: {
                ticketId: "70000000-0000-4000-8000-000000000001",
                placement: { columnId: "60000000-0000-4000-8000-000000000002" },
              },
            })
            yield* worker.dispatch(initialized)
            yield* worker.dispatch(created)
            yield* worker.dispatch(moved)
            const snapshot = expectSome(yield* readBoardSnapshot(ids.project), "Board should exist")
            assert.strictEqual(snapshot.snapshotSequence, 6)
            assert.strictEqual(snapshot.columns.length, 3)
            assert.strictEqual(snapshot.tickets.length, 1)
            assert.strictEqual(
              snapshot.tickets[0]?.columnId,
              "60000000-0000-4000-8000-000000000002",
            )
            assert.deepStrictEqual(
              snapshot.ticketActivity[0]?.events.map((event) => event.event._tag),
              ["ticket.moved", "ticket.created"],
            )
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
      assert.strictEqual(after.tickets[0]?.columnId, "60000000-0000-4000-8000-000000000002")
      assert.deepStrictEqual(
        after.ticketActivity[0]?.events.map((event) => event.event._tag),
        ["ticket.moved", "ticket.created"],
      )
    }),
  )

  it.effect("récupère les Sessions avant readiness sans réécrire un Turn terminal", () => {
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
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "noyau-session-recovery-",
      })
      const filename = path.join(directory, "state.sqlite")

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
                  modelSelection: { modelId: "composer-2.5", reasoningEffort: "medium" },
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
                  modelSelection: {
                    modelId: "composer-2.5",
                    reasoningEffort: "high",
                    serviceTier: "fast",
                  },
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
                  modelSelection: { modelId: "composer-2.5", reasoningEffort: "medium" },
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
            yield* projectDomainEvent(
              persisted(
                10,
                ThreadModelSelectionSet.make({
                  threadId: ids.terminalThread,
                  modelSelection: {
                    modelId: "composer-2.5-fast",
                    reasoningEffort: "high",
                    serviceTier: "fast",
                    thinking: false,
                  },
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
      assert.deepStrictEqual(evidence.recovery.thread.modelSelection, {
        modelId: "composer-2.5",
        reasoningEffort: "high",
        serviceTier: "fast",
      })
      assert.strictEqual(evidence.terminal.turns.at(-1)?.state, "completed")
      assert.strictEqual(evidence.terminal.thread.latestTurn?.state, "completed")
      assert.deepStrictEqual(evidence.terminal.thread.modelSelection, {
        modelId: "composer-2.5-fast",
        reasoningEffort: "high",
        serviceTier: "fast",
        thinking: false,
      })
      assert.strictEqual(evidence.terminal.transcript.length, 1)
      assert.strictEqual(evidence.shell.projects.length, 1)
      assert.strictEqual(evidence.shell.threads.length, 2)
      assert.strictEqual(
        evidence.shell.threads.find((thread) => thread.id === ids.recoveryThread)?.sessionStatus,
        "error",
      )
      assert.deepStrictEqual(
        evidence.shell.threads.find((thread) => thread.id === ids.recoveryThread)?.modelSelection,
        {
          modelId: "composer-2.5",
          reasoningEffort: "high",
          serviceTier: "fast",
        },
      )
    })
  })

  it.effect("ne bump pas updated_at sur assistant/tool/plan", () => {
    const turnId = Schema.decodeSync(TurnId)("80000000-0000-4000-8000-000000000004")
    return Effect.scoped(
      Effect.gen(function* () {
        const context = yield* Layer.build(sqliteLayer({ filename: ":memory:" }))
        const sql = Context.get(context, SqlClient)
        return yield* Effect.gen(function* () {
          yield* projectFixture()
          yield* projectDomainEvent(
            persisted(
              1,
              ThreadCreated.make({
                threadId: ids.recoveryThread,
                projectId: ids.project,
                title: "Streaming",
                provider: "cursor",
                runtimeMode: "full-access",
              }),
              "2026-08-20T00:02:00.000Z",
            ),
          )
          yield* projectDomainEvent(
            persisted(
              2,
              ThreadTurnStarted.make({
                threadId: ids.recoveryThread,
                turnId,
                text: "Travaille",
              }),
              "2026-08-20T00:02:01.000Z",
            ),
          )
          const afterTurn = expectSome(
            yield* readThreadSnapshot(ids.recoveryThread),
            "Thread should exist",
          )
          const turnUpdatedAt = DateTime.formatIso(afterTurn.thread.updatedAt)

          yield* projectDomainEvent(
            persisted(
              3,
              ThreadTranscriptAppended.make({
                item: {
                  _tag: "transcript.assistant",
                  threadId: ids.recoveryThread,
                  turnId,
                  text: "hello",
                },
              }),
              "2026-08-20T00:02:10.000Z",
            ),
          )
          yield* projectDomainEvent(
            persisted(
              4,
              ThreadTranscriptAppended.make({
                item: {
                  _tag: "transcript.plan",
                  threadId: ids.recoveryThread,
                  turnId,
                  markdown: "- [ ] Work",
                },
              }),
              "2026-08-20T00:02:11.000Z",
            ),
          )
          yield* projectDomainEvent(
            persisted(
              5,
              ThreadTranscriptAppended.make({
                item: {
                  _tag: "transcript.tool",
                  threadId: ids.recoveryThread,
                  turnId,
                  toolCallId: ToolCallId.make("tool-1"),
                  name: "Read",
                  status: "completed",
                },
              }),
              "2026-08-20T00:02:12.000Z",
            ),
          )
          const afterStreaming = expectSome(
            yield* readThreadSnapshot(ids.recoveryThread),
            "Thread should exist",
          )
          assert.strictEqual(DateTime.formatIso(afterStreaming.thread.updatedAt), turnUpdatedAt)
          assert.strictEqual(afterStreaming.transcript.length, 4)

          yield* projectDomainEvent(
            persisted(
              6,
              ThreadTranscriptAppended.make({
                item: {
                  _tag: "transcript.permission",
                  threadId: ids.recoveryThread,
                  turnId,
                  requestId: ApprovalRequestId.make("permission-1"),
                  status: "pending",
                },
              }),
              "2026-08-20T00:02:20.000Z",
            ),
          )
          const afterPermission = expectSome(
            yield* readThreadSnapshot(ids.recoveryThread),
            "Thread should exist",
          )
          assert.strictEqual(
            DateTime.formatIso(afterPermission.thread.updatedAt),
            "2026-08-20T00:02:20.000Z",
          )
          const byId = expectSome(
            yield* readThreadShellById(ids.recoveryThread),
            "Thread shell should exist",
          )
          const fromCatalogue = (yield* readShellSnapshot(environment)).threads.find(
            (thread) => thread.id === ids.recoveryThread,
          )
          assert.strictEqual(byId.id, ids.recoveryThread)
          assert.strictEqual(byId.hasPendingApprovals, true)
          assert.deepStrictEqual(byId, fromCatalogue)
        }).pipe(Effect.provideService(SqlClient, sql))
      }),
    )
  })

  it.effect("rebump listed_at à l'unsettle sans toucher created_at", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* Layer.build(sqliteLayer({ filename: ":memory:" }))
        const sql = Context.get(context, SqlClient)
        return yield* Effect.gen(function* () {
          yield* projectFixture()
          yield* projectDomainEvent(
            persisted(
              1,
              ThreadCreated.make({
                threadId: ids.recoveryThread,
                projectId: ids.project,
                title: "Ancien",
                provider: "cursor",
                runtimeMode: "full-access",
              }),
              "2026-08-10T00:00:00.000Z",
            ),
          )
          yield* projectDomainEvent(
            persisted(
              2,
              ThreadSettled.make({
                threadId: ids.recoveryThread,
                settledAt: occurredAt("2026-08-12T00:00:00.000Z"),
              }),
              "2026-08-12T00:00:00.000Z",
            ),
          )
          yield* projectDomainEvent(
            persisted(
              3,
              ThreadUnsettled.make({
                threadId: ids.recoveryThread,
                reason: "user",
              }),
              "2026-08-25T12:00:00.000Z",
            ),
          )
          const shell = expectSome(
            yield* readThreadShellById(ids.recoveryThread),
            "Thread should exist",
          )
          assert.strictEqual(DateTime.formatIso(shell.createdAt), "2026-08-10T00:00:00.000Z")
          assert.strictEqual(DateTime.formatIso(shell.listedAt), "2026-08-25T12:00:00.000Z")
          assert.strictEqual(DateTime.formatIso(shell.updatedAt), "2026-08-25T12:00:00.000Z")
          assert.strictEqual(shell.settledOverride, "active")
        }).pipe(Effect.provideService(SqlClient, sql))
      }),
    ),
  )

  it.effect("ancre started_at sur turn.started, pas session.updatedAt", () => {
    const turnId = Schema.decodeSync(TurnId)("80000000-0000-4000-8000-000000000003")
    const running = Schema.decodeSync(Session)({
      threadId: ids.recoveryThread,
      status: "running",
      lastError: null,
      activeTurnId: turnId,
      runtimeMode: "full-access",
      resumeCursor: { schemaVersion: 1, sessionId: "cursor-session-1" },
      updatedAt: "2026-08-20T00:01:15.000Z",
    })
    return Effect.scoped(
      Effect.gen(function* () {
        const context = yield* Layer.build(sqliteLayer({ filename: ":memory:" }))
        const sql = Context.get(context, SqlClient)
        return yield* Effect.gen(function* () {
          yield* projectFixture()
          yield* projectDomainEvent(
            persisted(
              1,
              ThreadCreated.make({
                threadId: ids.recoveryThread,
                projectId: ids.project,
                title: "Timer",
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
                turnId,
                text: "Compte le temps",
              }),
              "2026-08-20T00:01:00.000Z",
            ),
          )
          yield* projectDomainEvent(
            persisted(
              3,
              ThreadSessionSet.make({
                threadId: ids.recoveryThread,
                session: running,
              }),
              "2026-08-20T00:01:15.000Z",
            ),
          )
          const snapshot = expectSome(
            yield* readThreadSnapshot(ids.recoveryThread),
            "Thread should exist",
          )
          const shell = yield* readShellSnapshot(environment)
          const latestTurn = snapshot.thread.latestTurn
          const shellTurn = shell.threads.find(
            (thread) => thread.id === ids.recoveryThread,
          )?.latestTurn
          assert.strictEqual(
            latestTurn === null ? null : DateTime.formatIso(latestTurn.requestedAt),
            "2026-08-20T00:01:00.000Z",
          )
          assert.strictEqual(
            latestTurn?.startedAt == null ? null : DateTime.formatIso(latestTurn.startedAt),
            "2026-08-20T00:01:00.000Z",
          )
          assert.strictEqual(
            shellTurn?.startedAt == null ? null : DateTime.formatIso(shellTurn.startedAt),
            "2026-08-20T00:01:00.000Z",
          )
        }).pipe(Effect.provideService(SqlClient, sql))
      }),
    )
  })

  it.effect("retire le Thread et ses projections enfants", () => {
    const turnId = Schema.decodeSync(TurnId)("80000000-0000-4000-8000-000000000010")
    const session = Schema.decodeSync(Session)({
      threadId: ids.recoveryThread,
      status: "running",
      lastError: null,
      activeTurnId: turnId,
      runtimeMode: "full-access",
      resumeCursor: { schemaVersion: 1, sessionId: "cursor-session-delete" },
      updatedAt: "2026-08-20T00:03:00.000Z",
    })
    return Effect.scoped(
      Effect.gen(function* () {
        const context = yield* Layer.build(sqliteLayer({ filename: ":memory:" }))
        const sql = Context.get(context, SqlClient)
        return yield* Effect.gen(function* () {
          const countProjectionRows = () =>
            sql<{
              threads: number
              sessions: number
              turns: number
              transcript: number
              links: number
            }>`
              SELECT
                (SELECT COUNT(*) FROM projection_threads) AS threads,
                (SELECT COUNT(*) FROM projection_sessions) AS sessions,
                (SELECT COUNT(*) FROM projection_turns) AS turns,
                (SELECT COUNT(*) FROM projection_transcript) AS transcript,
                (SELECT COUNT(*) FROM projection_ticket_threads) AS links
            `

          yield* projectFixture()
          yield* projectDomainEvent(
            persisted(
              1,
              KanbanColumnCreated.make({
                columnId: ids.backlog,
                name: "Backlog",
                color: columnColor,
                rank: ranks.backlog,
                done: false,
              }),
            ),
          )
          yield* projectDomainEvent(
            persisted(
              2,
              TicketCreated.make({
                ticketId: ids.ticket,
                columnId: ids.backlog,
                rank: ranks.ticket,
                title: "Lié au Thread",
              }),
            ),
          )
          yield* projectDomainEvent(
            persisted(
              3,
              ThreadCreated.make({
                threadId: ids.recoveryThread,
                projectId: ids.project,
                title: "À supprimer",
                provider: "cursor",
                runtimeMode: "full-access",
              }),
            ),
          )
          yield* projectDomainEvent(
            persisted(
              4,
              TicketThreadLinked.make({
                ticketId: ids.ticket,
                threadId: ids.recoveryThread,
              }),
            ),
          )
          yield* projectDomainEvent(
            persisted(
              5,
              ThreadTurnStarted.make({
                threadId: ids.recoveryThread,
                turnId,
                text: "Travaille",
              }),
            ),
          )
          yield* projectDomainEvent(
            persisted(
              6,
              ThreadSessionSet.make({
                threadId: ids.recoveryThread,
                session,
              }),
            ),
          )
          yield* projectDomainEvent(
            persisted(
              7,
              ThreadTranscriptAppended.make({
                item: {
                  _tag: "transcript.assistant",
                  threadId: ids.recoveryThread,
                  turnId,
                  text: "hello",
                },
              }),
            ),
          )

          const before = yield* readThreadSnapshot(ids.recoveryThread)
          assert.isTrue(Option.isSome(before), "Thread should exist before delete")
          assert.deepStrictEqual((yield* countProjectionRows())[0], {
            threads: 1,
            sessions: 1,
            turns: 1,
            transcript: 2,
            links: 1,
          })

          yield* projectDomainEvent(
            persisted(8, ThreadDeleted.make({ threadId: ids.recoveryThread })),
          )

          const thread = yield* readThreadSnapshot(ids.recoveryThread)
          const shell = yield* readThreadShellById(ids.recoveryThread)

          assert.deepStrictEqual(thread, Option.none())
          assert.deepStrictEqual(shell, Option.none())
          assert.deepStrictEqual((yield* countProjectionRows())[0], {
            threads: 0,
            sessions: 0,
            turns: 0,
            transcript: 0,
            links: 0,
          })
        }).pipe(Effect.provideService(SqlClient, sql))
      }),
    )
  })

  it.effect("retire le Project et ses projections enfants malgré les FK colonnes", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* Layer.build(sqliteLayer({ filename: ":memory:" }))
        const sql = Context.get(context, SqlClient)
        return yield* Effect.gen(function* () {
          yield* projectFixture()
          yield* projectDomainEvent(
            persisted(
              1,
              KanbanColumnCreated.make({
                columnId: ids.backlog,
                name: "Backlog",
                color: columnColor,
                rank: ranks.backlog,
                done: false,
              }),
            ),
          )
          yield* projectDomainEvent(
            persisted(
              2,
              KanbanColumnCreated.make({
                columnId: ids.done,
                name: "Done",
                color: columnColor,
                rank: ranks.done,
                done: true,
              }),
            ),
          )
          yield* projectDomainEvent(
            persisted(
              3,
              TicketCreated.make({
                ticketId: ids.ticket,
                columnId: ids.backlog,
                rank: ranks.ticket,
                title: "Cascade delete",
              }),
            ),
          )
          yield* projectDomainEvent(
            persisted(
              4,
              TicketCompleted.make({
                ticketId: ids.ticket,
                previousColumnId: ids.backlog,
                doneColumnId: ids.done,
                rank: ranks.ticket,
              }),
            ),
          )
          yield* projectDomainEvent(
            persisted(
              5,
              ThreadCreated.make({
                threadId: ids.recoveryThread,
                projectId: ids.project,
                title: "Cascade",
                provider: "cursor",
                runtimeMode: "full-access",
              }),
            ),
          )
          yield* projectDomainEvent(
            persisted(
              6,
              TicketThreadLinked.make({
                ticketId: ids.ticket,
                threadId: ids.recoveryThread,
              }),
            ),
          )

          const before = yield* readBoardSnapshot(ids.project)
          assert.isTrue(Option.isSome(before), "Board should exist before delete")

          yield* projectDomainEvent(persisted(7, ProjectDeleted.make({ projectId: ids.project })))

          const board = yield* readBoardSnapshot(ids.project)
          const thread = yield* readThreadSnapshot(ids.recoveryThread)
          const owner = yield* findWorkspaceRootOwner(workspaceRoot)
          const leftovers = yield* sql<{
            projects: number
            columns: number
            tickets: number
            threads: number
            links: number
          }>`
            SELECT
              (SELECT COUNT(*) FROM projection_projects) AS projects,
              (SELECT COUNT(*) FROM projection_columns) AS columns,
              (SELECT COUNT(*) FROM projection_tickets) AS tickets,
              (SELECT COUNT(*) FROM projection_threads) AS threads,
              (SELECT COUNT(*) FROM projection_ticket_threads) AS links
          `

          assert.deepStrictEqual(board, Option.none())
          assert.deepStrictEqual(thread, Option.none())
          assert.deepStrictEqual(owner, Option.none())
          assert.deepStrictEqual(leftovers[0], {
            projects: 0,
            columns: 0,
            tickets: 0,
            threads: 0,
            links: 0,
          })
        }).pipe(Effect.provideService(SqlClient, sql))
      }),
    ),
  )
})
