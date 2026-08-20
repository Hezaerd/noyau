import { assert, describe, it } from "@effect/vitest"
import { memoryLayer } from "@noyau/database/sqlite"
import { ClientCommandRequest } from "@noyau/protocol/commands"
import { CommandIdConflict } from "@noyau/protocol/errors"
import { ActorId, ProjectId, ThreadId } from "@noyau/protocol/ids"
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

const projectCreate = (commandId = uuid(1), id = projectId) =>
  request({
    _tag: "project.create",
    commandId,
    payload: { projectId: id, name: "Noyau", workspaceRoot: `/tmp/${id}` },
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
    digest: (_algorithm, data) => Effect.succeed(data),
  })
}

const controlPlaneTestLayer = (hooks: ControlPlaneHooks = {}) =>
  makeControlPlaneLayer(hooks).pipe(
    Layer.provideMerge(memoryLayer),
    Layer.provideMerge(testServerConfigLayer()),
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
        assert.strictEqual(first.sequence, 1)
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
