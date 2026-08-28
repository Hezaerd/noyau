import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, describe, it } from "@effect/vitest"
import { ClientCommandRequest } from "@noyau/contracts/commands"
import { CommandIdConflict } from "@noyau/contracts/errors"
import { ActorId, ProjectId, ThreadId, TurnId } from "@noyau/contracts/ids"
import { ProjectNotFound, ProjectUnavailable } from "@noyau/contracts/project/errors"
import {
  WorkspaceRootConflict,
  WorkspaceRootNotDirectory,
  WorkspaceRootNotFound,
} from "@noyau/contracts/project/errors"
import { unavailableAgentSkillInstallerLayer } from "@noyau/server/agent-skill/installer"
import {
  ControlPlane,
  makeControlPlaneLayer,
  type ControlPlaneHooks,
} from "@noyau/server/control-plane"
import { noopDiscordPresenceLayer } from "@noyau/server/discord/presence"
import { mcpSessionRegistryLayer } from "@noyau/server/mcp/mcp-session-registry"
import { memoryLayer } from "@noyau/server/persistence/sqlite"
import { cursorProviderLayer } from "@noyau/server/provider/cursor-acp"
import { unavailableProviderLayer } from "@noyau/server/provider/provider-port"
import { unavailableTextGenerationLayer } from "@noyau/server/text-generation/text-generation"
import { ThreadLive, threadLiveLayer } from "@noyau/server/thread-live"
import { WorkspaceRootAccess, type WorkspaceRootAccessService } from "@noyau/server/workspace-root"
import {
  Crypto,
  Deferred,
  Effect,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
  Stream,
} from "effect"
import { TestClock } from "effect/testing"
import { SqlClient } from "effect/unstable/sql/SqlClient"

import { stubGitRuntimeLayer } from "./fixtures.ts"
import { testServerConfigLayer } from "./fixtures.ts"

const actorId = Schema.decodeSync(ActorId)("human:rpc-test")
const projectId = Schema.decodeSync(ProjectId)("10000000-0000-4000-8000-000000000001")
const otherProjectId = Schema.decodeSync(ProjectId)("10000000-0000-4000-8000-000000000002")
const threadId = Schema.decodeSync(ThreadId)("20000000-0000-4000-8000-000000000001")
const turnId = Schema.decodeSync(TurnId)("40000000-0000-4000-8000-000000000001")
const fakeCursorAgent = fileURLToPath(new URL("./fixtures/fake-cursor-acp.mjs", import.meta.url))

const uuid = (index: number) => `30000000-0000-4000-8000-${index.toString().padStart(12, "0")}`

const request = (input: (typeof ClientCommandRequest)["Encoded"]) =>
  Schema.decodeSync(ClientCommandRequest)(input)

const projectCreate = (commandId = uuid(1), id = projectId, workspaceRoot = "/tmp") =>
  request({
    _tag: "project.create",
    commandId,
    payload: { projectId: id, name: "Noyau", workspaceRoot },
  })

const projectRename = (commandId: string, name: string) =>
  request({
    _tag: "project.meta.update",
    commandId,
    payload: { projectId, name },
  })

const projectRebind = (commandId: string, workspaceRoot: string) =>
  request({
    _tag: "project.rebind",
    commandId,
    payload: { projectId, workspaceRoot },
  })

const threadCreate = request({
  _tag: "thread.create",
  commandId: uuid(10),
  payload: { threadId, projectId, title: "RPC control plane" },
})

const testCrypto = () => {
  let counter = 0
  return Crypto.make({
    randomBytes: (size) => {
      const bytes = new Uint8Array(size)
      counter += 1
      bytes[size - 1] = counter % 256
      bytes[size - 2] = (counter >> 8) % 256
      return bytes
    },
    digest: (algorithm, data) =>
      Effect.succeed(
        new Uint8Array(createHash(algorithm.toLowerCase().replace("-", "")).update(data).digest()),
      ),
  })
}

const availableWorkspaceRoots: WorkspaceRootAccessService = {
  isAvailable: () => Effect.succeed(true),
}

const controlPlaneTestLayer = (
  hooks: ControlPlaneHooks = {},
  workspaceRoots: WorkspaceRootAccessService = availableWorkspaceRoots,
) =>
  makeControlPlaneLayer(hooks).pipe(
    Layer.provideMerge(unavailableAgentSkillInstallerLayer),
    Layer.provideMerge(memoryLayer),
    Layer.provideMerge(testServerConfigLayer()),
    Layer.provideMerge(unavailableProviderLayer),
    Layer.provideMerge(threadLiveLayer),
    Layer.provideMerge(unavailableTextGenerationLayer),
    Layer.provideMerge(noopDiscordPresenceLayer),
    Layer.provideMerge(stubGitRuntimeLayer),
    Layer.provideMerge(Layer.succeed(WorkspaceRootAccess)(workspaceRoots)),
    Layer.provideMerge(NodeFileSystem.layer),
    Layer.provideMerge(Path.layer),
    Layer.provide(Layer.succeed(Crypto.Crypto)(testCrypto())),
  )

const cursorControlPlaneTestLayer = (scenario: string) =>
  makeControlPlaneLayer().pipe(
    Layer.provideMerge(unavailableAgentSkillInstallerLayer),
    Layer.provideMerge(memoryLayer),
    Layer.provideMerge(testServerConfigLayer()),
    Layer.provideMerge(unavailableTextGenerationLayer),
    Layer.provideMerge(noopDiscordPresenceLayer),
    Layer.provideMerge(stubGitRuntimeLayer),
    Layer.provideMerge(Layer.succeed(WorkspaceRootAccess)(availableWorkspaceRoots)),
    Layer.provideMerge(
      cursorProviderLayer({
        binaryPath: process.execPath,
        binaryArgs: [fakeCursorAgent],
        environment: {
          PATH: "",
          NOYAU_FAKE_ACP_SCENARIO: scenario,
        },
        clientVersion: "test",
      }),
    ),
    Layer.provideMerge(mcpSessionRegistryLayer.pipe(Layer.provide(testServerConfigLayer()))),
    Layer.provideMerge(NodeFileSystem.layer),
    Layer.provideMerge(Path.layer),
    Layer.provide(Layer.succeed(Crypto.Crypto)(testCrypto())),
  )

const run = <A, E>(
  effect: Effect.Effect<A, E, ControlPlane | SqlClient | ThreadLive>,
  hooks: ControlPlaneHooks = {},
  workspaceRoots: WorkspaceRootAccessService = availableWorkspaceRoots,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const services = yield* Layer.build(controlPlaneTestLayer(hooks, workspaceRoots))
      return yield* effect.pipe(Effect.provide(services))
    }),
  )

describe("ControlPlane", () => {
  it.effect("dispatches durably, retries a command, and rejects commandId scope reuse", () =>
    run(
      Effect.gen(function* () {
        const controlPlane = yield* ControlPlane
        const first = yield* controlPlane.dispatch(projectCreate(), actorId)
        const retry = yield* controlPlane.dispatch(projectCreate(), actorId)
        const conflict = yield* controlPlane
          .dispatch(projectCreate(uuid(1), otherProjectId), actorId)
          .pipe(Effect.flip)

        assert.deepStrictEqual(retry, first)
        assert.strictEqual(first.sequence, 5)
        assert.instanceOf(conflict, CommandIdConflict)

        const frames = yield* controlPlane
          .subscribeProject({ projectId, requestCompletionMarker: true })
          .pipe(Stream.take(2), Stream.runCollect)
        assert.strictEqual(frames[0]?.kind, "snapshot")
        assert.strictEqual(frames[1]?.kind, "synchronized")

        const config = yield* controlPlane.getConfig
        assert.strictEqual(config.databaseSchemaVersion, 11)
        assert.deepStrictEqual(yield* controlPlane.probe, {})
        assert.deepStrictEqual(
          yield* controlPlane.setShellFocus({
            enabled: true,
            focus: { _tag: "tableau", projectId },
          }),
          {},
        )
      }),
    ),
  )

  it.effect("validates WorkspaceRoots at IO and reflects disappearance then relink", () => {
    const available = new Set<string>(["/tmp"])
    const workspaceRoots: WorkspaceRootAccessService = {
      isAvailable: (workspaceRoot) => Effect.succeed(available.has(workspaceRoot)),
    }

    return run(
      Effect.gen(function* () {
        const controlPlane = yield* ControlPlane
        yield* controlPlane.dispatch(projectCreate(), actorId)

        available.clear()
        const unavailableShell = yield* controlPlane
          .subscribeShell({ requestCompletionMarker: true })
          .pipe(Stream.take(1), Stream.runHead)
        assert.strictEqual(
          unavailableShell.pipe(
            Option.flatMap((frame) =>
              frame.kind === "snapshot"
                ? Option.fromNullishOr(frame.snapshot.projects[0])
                : Option.none(),
            ),
            Option.map((project) => project.available),
            Option.getOrUndefined,
          ),
          false,
        )

        const unavailableCommand = yield* controlPlane
          .dispatch(threadCreate, actorId)
          .pipe(Effect.flip)
        assert.instanceOf(unavailableCommand, ProjectUnavailable)

        const invalidRebind = yield* controlPlane
          .dispatch(projectRebind(uuid(2), "/tmp/missing"), actorId)
          .pipe(Effect.flip)
        assert.instanceOf(invalidRebind, WorkspaceRootNotFound)

        available.add("/")
        yield* controlPlane.dispatch(projectRebind(uuid(3), "/"), actorId)
        const relinked = yield* controlPlane
          .subscribeProject({ projectId, requestCompletionMarker: true })
          .pipe(Stream.take(1), Stream.runHead)
        const project = relinked.pipe(
          Option.flatMap((frame) =>
            frame.kind === "snapshot" ? Option.some(frame.snapshot.project) : Option.none(),
          ),
          Option.getOrThrow,
        )
        assert.strictEqual(project.workspaceRoot, "/")
        assert.isTrue(project.available)
      }),
      {},
      workspaceRoots,
    )
  })

  it.effect("creates Project and native Board atomically through production dispatch", () =>
    run(
      Effect.gen(function* () {
        const controlPlane = yield* ControlPlane
        const sql = yield* SqlClient
        const created = yield* controlPlane.dispatch(projectCreate(), actorId)

        assert.strictEqual(created.sequence, 5)
        const frames = yield* controlPlane
          .subscribeProject({ projectId, requestCompletionMarker: true })
          .pipe(Stream.take(2), Stream.runCollect)
        const first = frames[0]
        assert.strictEqual(first?.kind, "snapshot")
        if (first?.kind !== "snapshot") {
          return
        }
        assert.deepStrictEqual(
          first.snapshot.columns.map((column) => column.name),
          ["Backlog", "En cours", "Done"],
        )
        const done = first.snapshot.columns.find((column) => column.done)
        assert.isDefined(done)
        if (done === undefined) {
          return
        }

        const protectedDone = yield* controlPlane
          .dispatch(
            request({
              _tag: "kanbanColumn.delete",
              commandId: uuid(2),
              payload: { columnId: done.id },
            }),
            actorId,
          )
          .pipe(Effect.flip)
        assert.strictEqual(protectedDone._tag, "ProtectedDoneColumn")

        const rows = yield* sql<{ events: number; projects: number; columns: number }>`
          SELECT
            (SELECT COUNT(*) FROM events WHERE causation_id = ${uuid(1)}) AS events,
            (SELECT COUNT(*) FROM projection_projects WHERE project_id = ${projectId}) AS projects,
            (SELECT COUNT(*) FROM projection_columns WHERE project_id = ${projectId}) AS columns
        `
        assert.deepStrictEqual(rows[0], { events: 5, projects: 1, columns: 3 })
      }),
    ),
  )

  it.effect("persists stable WorkspaceRootConflict receipts for create and rebind", () =>
    run(
      Effect.gen(function* () {
        const controlPlane = yield* ControlPlane
        const sql = yield* SqlClient
        yield* controlPlane.dispatch(projectCreate(uuid(1), projectId, "/tmp"), actorId)

        const conflictingCreate = projectCreate(uuid(2), otherProjectId, "/tmp")
        const createError = yield* controlPlane
          .dispatch(conflictingCreate, actorId)
          .pipe(Effect.flip)
        const createRetry = yield* controlPlane
          .dispatch(conflictingCreate, actorId)
          .pipe(Effect.flip)
        assert.instanceOf(createError, WorkspaceRootConflict)
        assert.deepStrictEqual(createRetry, createError)
        assert.strictEqual(createError._tag, "WorkspaceRootConflict")
        assert.strictEqual(createError.workspaceRoot, "/tmp")
        assert.strictEqual(createError.projectId, projectId)

        yield* controlPlane.dispatch(projectCreate(uuid(3), otherProjectId, "/"), actorId)
        const rebind = request({
          _tag: "project.rebind",
          commandId: uuid(4),
          payload: { projectId: otherProjectId, workspaceRoot: "/tmp" },
        })
        const rebindError = yield* controlPlane.dispatch(rebind, actorId).pipe(Effect.flip)
        const rebindRetry = yield* controlPlane.dispatch(rebind, actorId).pipe(Effect.flip)
        assert.instanceOf(rebindError, WorkspaceRootConflict)
        assert.deepStrictEqual(rebindRetry, rebindError)
        assert.strictEqual(rebindError._tag, "WorkspaceRootConflict")

        const receipts = yield* sql<{ response: string }>`
          SELECT response
          FROM receipts
          WHERE command_id IN (${uuid(2)}, ${uuid(4)})
          ORDER BY command_id
        `
        assert.strictEqual(receipts.length, 2)
        assert.isTrue(receipts.every((row) => row.response.includes('"WorkspaceRootConflict"')))
      }),
    ),
  )

  it.effect("persists stable existing-directory rejections for create and rebind", () =>
    run(
      Effect.gen(function* () {
        const controlPlane = yield* ControlPlane
        const sql = yield* SqlClient
        const missing = `/tmp/noyau-missing-${uuid(90)}`
        const missingCreateRequest = projectCreate(uuid(1), projectId, missing)
        const fileCreateRequest = projectCreate(uuid(2), projectId, "/etc/hosts")
        const missingCreate = yield* controlPlane
          .dispatch(missingCreateRequest, actorId)
          .pipe(Effect.flip)
        const missingCreateRetry = yield* controlPlane
          .dispatch(missingCreateRequest, actorId)
          .pipe(Effect.flip)
        const fileCreate = yield* controlPlane
          .dispatch(fileCreateRequest, actorId)
          .pipe(Effect.flip)
        const fileCreateRetry = yield* controlPlane
          .dispatch(fileCreateRequest, actorId)
          .pipe(Effect.flip)
        assert.instanceOf(missingCreate, WorkspaceRootNotFound)
        assert.deepStrictEqual(missingCreateRetry, missingCreate)
        assert.instanceOf(fileCreate, WorkspaceRootNotDirectory)
        assert.deepStrictEqual(fileCreateRetry, fileCreate)

        yield* controlPlane.dispatch(projectCreate(uuid(3), projectId, "/tmp"), actorId)
        const missingRebindRequest = request({
          _tag: "project.rebind",
          commandId: uuid(4),
          payload: { projectId, workspaceRoot: missing },
        })
        const missingRebind = yield* controlPlane
          .dispatch(missingRebindRequest, actorId)
          .pipe(Effect.flip)
        const missingRebindRetry = yield* controlPlane
          .dispatch(missingRebindRequest, actorId)
          .pipe(Effect.flip)
        assert.instanceOf(missingRebind, WorkspaceRootNotFound)
        assert.deepStrictEqual(missingRebindRetry, missingRebind)

        const receipts = yield* sql<{ response: string }>`
          SELECT response
          FROM receipts
          WHERE command_id IN (${uuid(1)}, ${uuid(2)}, ${uuid(4)})
          ORDER BY command_id
        `
        assert.strictEqual(receipts.length, 3)
        assert.isTrue(receipts[0]?.response.includes('"WorkspaceRootNotFound"'))
        assert.isTrue(receipts[1]?.response.includes('"WorkspaceRootNotDirectory"'))
        assert.isTrue(receipts[2]?.response.includes('"WorkspaceRootNotFound"'))
      }),
    ),
  )

  it.effect("replays a bounded afterSequence and snapshots gaps over 1000", () =>
    run(
      Effect.gen(function* () {
        const controlPlane = yield* ControlPlane
        const sql = yield* SqlClient
        const created = yield* controlPlane.dispatch(projectCreate(), actorId)
        const renamed = yield* controlPlane.dispatch(projectRename(uuid(2), "Noyau RPC"), actorId)

        const replay = yield* controlPlane
          .subscribeProject({
            projectId,
            afterSequence: created.sequence,
            requestCompletionMarker: true,
          })
          .pipe(Stream.take(2), Stream.runCollect)
        assert.strictEqual(replay[0]?.kind, "event")
        assert.strictEqual(
          replay[0]?.kind === "event" ? replay[0].event.sequence : -1,
          renamed.sequence,
        )
        assert.strictEqual(replay[1]?.kind, "synchronized")

        yield* sql`
          WITH RECURSIVE gap(n) AS (
            SELECT 1
            UNION ALL
            SELECT n + 1 FROM gap WHERE n < 1001
          )
          INSERT INTO events (
            event_id, project_id, actor_id, correlation_id, causation_id,
            occurred_at, schema_version, aggregate_kind, aggregate_id,
            aggregate_version, event
          )
          SELECT
            printf('gap-%04d', n),
            ${projectId},
            ${actorId},
            ${uuid(9000)},
            ${uuid(9001)},
            '2026-08-20T00:00:00.000Z',
            1,
            'gap',
            printf('aggregate-%04d', n),
            1,
            '{}'
          FROM gap
        `

        const reset = yield* controlPlane
          .subscribeProject({
            projectId,
            afterSequence: created.sequence,
            requestCompletionMarker: true,
          })
          .pipe(Stream.take(2), Stream.runCollect)
        assert.strictEqual(reset[0]?.kind, "snapshot")
        assert.strictEqual(reset[1]?.kind, "synchronized")
      }),
    ),
  )

  it.effect("attaches the live project buffer before catch-up", () =>
    Effect.gen(function* () {
      const catchUpStarted = yield* Deferred.make<void>()
      const releaseCatchUp = yield* Deferred.make<void>()
      const hooks: ControlPlaneHooks = {
        beforeProjectCatchUp: () =>
          Deferred.succeed(catchUpStarted, undefined).pipe(
            Effect.andThen(Deferred.await(releaseCatchUp)),
          ),
      }
      const program = Effect.gen(function* () {
        const controlPlane = yield* ControlPlane
        const created = yield* controlPlane.dispatch(projectCreate(), actorId)
        const historical = yield* controlPlane.dispatch(
          projectRename(uuid(2), "Historical"),
          actorId,
        )
        const subscription = yield* controlPlane
          .subscribeProject({
            projectId,
            afterSequence: created.sequence,
            requestCompletionMarker: true,
          })
          .pipe(Stream.take(3), Stream.runCollect, Effect.forkChild)
        yield* Deferred.await(catchUpStarted)
        const live = yield* controlPlane.dispatch(projectRename(uuid(3), "Live"), actorId)
        yield* Deferred.succeed(releaseCatchUp, undefined)
        const frames = yield* Fiber.join(subscription)

        assert.strictEqual(frames[0]?.kind, "event")
        assert.strictEqual(
          frames[0]?.kind === "event" ? frames[0].event.sequence : -1,
          historical.sequence,
        )
        assert.strictEqual(frames[1]?.kind, "event")
        assert.strictEqual(
          frames[1]?.kind === "event" ? frames[1].event.sequence : -1,
          live.sequence,
        )
        assert.strictEqual(frames[2]?.kind, "synchronized")
      })
      yield* run(program, hooks)
    }),
  )

  it.effect("buffers live project events before the snapshot is released", () =>
    Effect.gen(function* () {
      const snapshotRead = yield* Deferred.make<void>()
      const releaseSnapshot = yield* Deferred.make<void>()
      const hooks: ControlPlaneHooks = {
        afterProjectSnapshot: () =>
          Deferred.succeed(snapshotRead, undefined).pipe(
            Effect.andThen(Deferred.await(releaseSnapshot)),
          ),
      }
      const program = Effect.gen(function* () {
        const controlPlane = yield* ControlPlane
        yield* controlPlane.dispatch(projectCreate(), actorId)
        const subscription = yield* controlPlane
          .subscribeProject({ projectId, requestCompletionMarker: true })
          .pipe(Stream.take(3), Stream.runCollect, Effect.forkChild)
        yield* Deferred.await(snapshotRead)
        const renamed = yield* controlPlane.dispatch(projectRename(uuid(2), "Buffered"), actorId)
        yield* Deferred.succeed(releaseSnapshot, undefined)
        const frames = yield* Fiber.join(subscription)

        assert.strictEqual(frames[0]?.kind, "snapshot")
        assert.strictEqual(frames[1]?.kind, "event")
        assert.strictEqual(
          frames[1]?.kind === "event" ? frames[1].event.sequence : -1,
          renamed.sequence,
        )
        assert.strictEqual(frames[2]?.kind, "synchronized")
      })
      yield* run(program, hooks)
    }),
  )

  it.effect("buffers live Thread events before the snapshot is released", () =>
    Effect.gen(function* () {
      const snapshotRead = yield* Deferred.make<void>()
      const releaseSnapshot = yield* Deferred.make<void>()
      const hooks: ControlPlaneHooks = {
        afterThreadSnapshot: () =>
          Deferred.succeed(snapshotRead, undefined).pipe(
            Effect.andThen(Deferred.await(releaseSnapshot)),
          ),
      }
      const program = Effect.gen(function* () {
        const controlPlane = yield* ControlPlane
        yield* controlPlane.dispatch(projectCreate(), actorId)
        yield* controlPlane.dispatch(threadCreate, actorId)
        const subscription = yield* controlPlane
          .subscribeThread({ threadId, requestCompletionMarker: true })
          .pipe(Stream.take(3), Stream.runCollect, Effect.forkChild)
        yield* Deferred.await(snapshotRead)
        const started = yield* controlPlane.dispatch(
          request({
            _tag: "thread.turn.start",
            commandId: uuid(13),
            payload: { threadId, text: "Stream live" },
          }),
          actorId,
        )
        yield* Deferred.succeed(releaseSnapshot, undefined)
        const frames = yield* Fiber.join(subscription)

        assert.strictEqual(frames[0]?.kind, "snapshot")
        assert.strictEqual(frames[1]?.kind, "event")
        assert.strictEqual(
          frames[1]?.kind === "event" ? frames[1].event.sequence : -1,
          started.sequence,
        )
        assert.strictEqual(frames[2]?.kind, "synchronized")
      })
      yield* run(program, hooks)
    }),
  )

  it.effect("emits the Thread snapshot before any assistant live hint", () =>
    Effect.gen(function* () {
      const snapshotRead = yield* Deferred.make<void>()
      const releaseSnapshot = yield* Deferred.make<void>()
      const hooks: ControlPlaneHooks = {
        afterThreadSnapshot: () =>
          Deferred.succeed(snapshotRead, undefined).pipe(
            Effect.andThen(Deferred.await(releaseSnapshot)),
          ),
      }
      const program = Effect.gen(function* () {
        const controlPlane = yield* ControlPlane
        const threadLive = yield* ThreadLive
        yield* controlPlane.dispatch(projectCreate(), actorId)
        yield* controlPlane.dispatch(threadCreate, actorId)
        const subscription = yield* controlPlane
          .subscribeThread({ threadId, requestCompletionMarker: true })
          .pipe(Stream.take(3), Stream.runCollect, Effect.forkChild)
        yield* Deferred.await(snapshotRead)
        yield* threadLive.publish({
          threadId,
          turnId,
          text: "Bonjour",
        })
        yield* Deferred.succeed(releaseSnapshot, undefined)
        const frames = yield* Fiber.join(subscription)

        assert.strictEqual(frames[0]?.kind, "snapshot")
        const live = frames.find((frame) => frame.kind === "live")
        assert.strictEqual(live?.kind, "live")
        if (live?.kind === "live") {
          assert.strictEqual(live.live.text, "Bonjour")
        }
      })
      yield* run(program, hooks)
    }),
  )

  it.effect("serves shell and thread snapshots and coalesces shell updates", () =>
    Effect.gen(function* () {
      const snapshotRead = yield* Deferred.make<void>()
      const releaseSnapshot = yield* Deferred.make<void>()
      const hooks: ControlPlaneHooks = {
        afterShellSnapshot: () =>
          Deferred.succeed(snapshotRead, undefined).pipe(
            Effect.andThen(Deferred.await(releaseSnapshot)),
          ),
      }
      const program = Effect.gen(function* () {
        const controlPlane = yield* ControlPlane
        yield* controlPlane.dispatch(projectCreate(), actorId)
        yield* controlPlane.dispatch(threadCreate, actorId)

        const threadFrames = yield* controlPlane
          .subscribeThread({ threadId, requestCompletionMarker: true })
          .pipe(Stream.take(2), Stream.runCollect)
        assert.strictEqual(threadFrames[0]?.kind, "snapshot")
        assert.strictEqual(threadFrames[1]?.kind, "synchronized")

        const shellFiber = yield* controlPlane
          .subscribeShell({ requestCompletionMarker: true })
          .pipe(Stream.take(3), Stream.runCollect, Effect.forkChild)
        yield* Deferred.await(snapshotRead)
        yield* controlPlane.dispatch(projectRename(uuid(11), "First"), actorId)
        const latest = yield* controlPlane.dispatch(projectRename(uuid(12), "Second"), actorId)
        yield* Deferred.succeed(releaseSnapshot, undefined)
        yield* Effect.yieldNow
        yield* TestClock.adjust("25 millis")
        const shellFrames = yield* Fiber.join(shellFiber)

        assert.strictEqual(shellFrames[0]?.kind, "snapshot")
        assert.strictEqual(shellFrames[1]?.kind, "event")
        assert.strictEqual(
          shellFrames[1]?.kind === "event" ? shellFrames[1].event.sequence : -1,
          latest.sequence,
        )
        assert.strictEqual(shellFrames[2]?.kind, "synchronized")
      })
      yield* run(program, hooks)
    }),
  )

  it.effect("streams Cursor Session dates and durably completes end_turn", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const services = yield* Layer.build(cursorControlPlaneTestLayer("success"))
        const controlPlane = yield* ControlPlane.pipe(Effect.provide(services))
        yield* controlPlane.dispatch(
          request({
            _tag: "project.create",
            commandId: uuid(21),
            payload: {
              projectId,
              name: "Cursor reactor",
              workspaceRoot: process.cwd(),
            },
          }),
          actorId,
        )
        yield* controlPlane.dispatch(threadCreate, actorId)
        const started = yield* controlPlane.dispatch(
          request({
            _tag: "thread.turn.start",
            commandId: uuid(22),
            payload: { threadId, text: "Run fake Cursor" },
          }),
          actorId,
        )
        yield* controlPlane.drainReactors

        const liveSession = yield* controlPlane
          .subscribeThread({ threadId, afterSequence: started.sequence })
          .pipe(
            Stream.filter(
              (frame) => frame.kind === "event" && frame.event.event._tag === "thread.session-set",
            ),
            Stream.runHead,
          )
        assert.isTrue(Option.isSome(liveSession))

        const frames = yield* controlPlane
          .subscribeThread({ threadId })
          .pipe(Stream.take(1), Stream.runCollect)
        const snapshot = frames[0]
        assert.strictEqual(snapshot?.kind, "snapshot")
        if (snapshot?.kind === "snapshot") {
          assert.strictEqual(snapshot.snapshot.thread.latestTurn?.state, "completed")
          assert.strictEqual(snapshot.snapshot.session?.status, "ready")
          assert.strictEqual(snapshot.snapshot.session?.resumeCursor?.sessionId, "fake-session-new")
          assert.isTrue(
            snapshot.snapshot.transcript.some(
              (item) =>
                item._tag === "transcript.assistant" && item.text === "hello from fake Cursor",
            ),
          )
        }

        yield* controlPlane.dispatch(
          request({
            _tag: "session.stop",
            commandId: uuid(23),
            payload: { threadId },
          }),
          actorId,
        )
        yield* controlPlane.drainReactors
        const stoppedFrames = yield* controlPlane
          .subscribeThread({ threadId })
          .pipe(Stream.take(1), Stream.runCollect)
        const stoppedSnapshot = stoppedFrames[0]
        assert.strictEqual(stoppedSnapshot?.kind, "snapshot")
        if (stoppedSnapshot?.kind === "snapshot") {
          assert.strictEqual(stoppedSnapshot.snapshot.session?.status, "stopped")
        }
      }),
    ),
  )

  it.effect("durably projects Cursor rupture as Session and latestTurn error", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const services = yield* Layer.build(cursorControlPlaneTestLayer("rupture"))
        const controlPlane = yield* ControlPlane.pipe(Effect.provide(services))
        yield* controlPlane.dispatch(
          request({
            _tag: "project.create",
            commandId: uuid(31),
            payload: {
              projectId,
              name: "Cursor rupture",
              workspaceRoot: process.cwd(),
            },
          }),
          actorId,
        )
        yield* controlPlane.dispatch(threadCreate, actorId)
        yield* controlPlane.dispatch(
          request({
            _tag: "thread.turn.start",
            commandId: uuid(32),
            payload: { threadId, text: "Break fake Cursor" },
          }),
          actorId,
        )
        yield* controlPlane.drainReactors

        const frames = yield* controlPlane
          .subscribeThread({ threadId })
          .pipe(Stream.take(1), Stream.runCollect)
        const snapshot = frames[0]
        assert.strictEqual(snapshot?.kind, "snapshot")
        if (snapshot?.kind === "snapshot") {
          assert.strictEqual(snapshot.snapshot.thread.latestTurn?.state, "error")
          assert.strictEqual(snapshot.snapshot.session?.status, "error")
          assert.include(snapshot.snapshot.session?.lastError ?? "", "session/prompt")
        }
      }),
    ),
  )

  it.effect("searches workspace paths for composer mentions", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const services = yield* Layer.build(controlPlaneTestLayer())
        yield* Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem
          const path = yield* Path.Path
          const workspace = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-search-" })
          yield* fileSystem.makeDirectory(path.join(workspace, "src"), { recursive: true })
          yield* fileSystem.writeFileString(path.join(workspace, "src/adapter.ts"), "export {}\n")
          yield* fileSystem.writeFileString(path.join(workspace, "README.md"), "# n\n")
          yield* fileSystem.makeDirectory(path.join(workspace, "node_modules"))
          yield* fileSystem.writeFileString(path.join(workspace, "node_modules/skip.ts"), "")

          const controlPlane = yield* ControlPlane
          yield* controlPlane.dispatch(projectCreate(uuid(40), projectId, workspace), actorId)
          const result = yield* controlPlane.searchWorkspacePaths(projectId, "adapter")
          assert.deepStrictEqual(result.entries, [{ path: "src/adapter.ts", kind: "file" }])

          const missing = yield* controlPlane
            .searchWorkspacePaths(otherProjectId, "adapter")
            .pipe(Effect.flip)
          assert.instanceOf(missing, ProjectNotFound)
        }).pipe(Effect.provide(services))
      }),
    ),
  )
})
