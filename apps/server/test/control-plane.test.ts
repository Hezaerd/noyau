import { createHash } from "node:crypto"

import * as BunFileSystem from "@effect/platform-bun/BunFileSystem"
import { assert, describe, it } from "@effect/vitest"
import { memoryLayer } from "@noyau/database/sqlite"
import { ClientCommandRequest } from "@noyau/protocol/commands"
import { CommandIdConflict } from "@noyau/protocol/errors"
import { ActorId, ProjectId, ThreadId } from "@noyau/protocol/ids"
import {
  WorkspaceRootConflict,
  WorkspaceRootNotDirectory,
  WorkspaceRootNotFound,
} from "@noyau/protocol/project/errors"
import {
  ControlPlane,
  makeControlPlaneLayer,
  type ControlPlaneHooks,
} from "@noyau/server/control-plane"
import { Crypto, Deferred, Effect, Fiber, Layer, Schema, Stream } from "effect"
import { TestClock } from "effect/testing"
import { SqlClient } from "effect/unstable/sql/SqlClient"

import { testServerConfigLayer } from "./fixtures"

const actorId = Schema.decodeSync(ActorId)("human:rpc-test")
const projectId = Schema.decodeSync(ProjectId)("10000000-0000-4000-8000-000000000001")
const otherProjectId = Schema.decodeSync(ProjectId)("10000000-0000-4000-8000-000000000002")
const threadId = Schema.decodeSync(ThreadId)("20000000-0000-4000-8000-000000000001")

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

const controlPlaneTestLayer = (hooks: ControlPlaneHooks = {}) =>
  makeControlPlaneLayer(hooks).pipe(
    Layer.provideMerge(memoryLayer),
    Layer.provideMerge(testServerConfigLayer()),
    Layer.provideMerge(BunFileSystem.layer),
    Layer.provide(Layer.succeed(Crypto.Crypto)(testCrypto())),
  )

const run = <A, E>(
  effect: Effect.Effect<A, E, ControlPlane | SqlClient>,
  hooks: ControlPlaneHooks = {},
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const services = yield* Layer.build(controlPlaneTestLayer(hooks))
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
        assert.strictEqual(config.databaseSchemaVersion, 2)
        assert.deepStrictEqual(yield* controlPlane.probe, {})
      }),
    ),
  )

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

        yield* controlPlane.dispatch(projectCreate(uuid(3), otherProjectId, "/workspace"), actorId)
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
})
