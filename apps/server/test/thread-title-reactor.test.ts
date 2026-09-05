import { createHash } from "node:crypto"

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, describe, it, layer as effectLayer } from "@effect/vitest"
import { ClientCommandRequest, type InternalCommand } from "@noyau/contracts/commands"
import { type DomainEvent } from "@noyau/contracts/events"
import { ActorId, ProjectId, ThreadId, TurnId } from "@noyau/contracts/ids"
import { ThreadTurnStarted } from "@noyau/contracts/thread/events"
import { DEFAULT_THREAD_TITLE } from "@noyau/contracts/thread/title"
import { unavailableAgentSkillInstallerLayer } from "@noyau/server/agent-skill/installer"
import { ControlPlane, makeControlPlaneLayer } from "@noyau/server/control-plane"
import { noopDiscordPresenceLayer } from "@noyau/server/discord/presence"
import type { PersistedEvent } from "@noyau/server/persistence/command-worker"
import { memoryLayer } from "@noyau/server/persistence/sqlite"
import { staticProviderRegistryLayer } from "@noyau/server/provider/provider-instance-registry"
import { unavailableProviderLayer } from "@noyau/server/provider/provider-port"
import {
  TextGeneration,
  type TextGenerationService,
  type ThreadTitleGenerationInput,
} from "@noyau/server/text-generation/text-generation"
import { threadLiveLayer } from "@noyau/server/thread-live"
import { WorkspaceRootAccess } from "@noyau/server/workspace-root"
import { Crypto, DateTime, Deferred, Effect, Fiber, Layer, Path, Schema, Stream } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

/* eslint-disable import/no-relative-parent-imports -- Focused reactor coverage uses the real service seams. */
import {
  makeThreadTitleReactor,
  type DispatchInternal,
} from "../src/text-generation/thread-title-reactor.ts"
/* eslint-enable import/no-relative-parent-imports */
import { stubGitRuntimeLayer, stubVcsStatusBroadcasterLayer } from "./fixtures.ts"
import { testServerConfigLayer } from "./fixtures.ts"

const actorId = Schema.decodeSync(ActorId)("human:rpc-test")
const projectId = Schema.decodeSync(ProjectId)("10000000-0000-4000-8000-000000000001")
const threadId = Schema.decodeSync(ThreadId)("20000000-0000-4000-8000-000000000001")
const zeroTurnThreadId = Schema.decodeSync(ThreadId)("20000000-0000-4000-8000-000000000002")
const multipleTurnThreadId = Schema.decodeSync(ThreadId)("20000000-0000-4000-8000-000000000003")

const uuid = (index: number) => `30000000-0000-4000-8000-${index.toString().padStart(12, "0")}`
const titleTurnId = Schema.decodeSync(TurnId)(uuid(11))
const multipleTurnFirstId = Schema.decodeSync(TurnId)(uuid(12))
const multipleTurnSecondId = Schema.decodeSync(TurnId)(uuid(13))
const zeroTurnEventId = Schema.decodeSync(TurnId)(uuid(14))

const request = (input: (typeof ClientCommandRequest)["Encoded"]) =>
  Schema.decodeSync(ClientCommandRequest)(input)

const trackSql = (sql: SqlClient, queries: Array<string>) =>
  new Proxy(sql, {
    apply(target, _thisArg, args) {
      const [strings, ...values] = args
      queries.push(Array.from(strings).join("?"))
      return target(strings, ...values)
    },
  })

const persistedTitleEvent = (
  event: DomainEvent,
  options: { readonly projectId?: ProjectId; readonly threadId?: ThreadId } = {},
): PersistedEvent<DomainEvent> => ({
  eventId: uuid(8),
  sequence: 8,
  projectId: options.projectId ?? projectId,
  actorId,
  correlationId: uuid(9),
  causationId: uuid(10),
  occurredAt: DateTime.makeUnsafe("2026-08-20T00:00:00.000Z"),
  schemaVersion: 1,
  aggregate: { kind: "thread", id: options.threadId ?? threadId },
  aggregateVersion: 1,
  event,
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

const stubTextGenerationLayer = (
  generate: (input: ThreadTitleGenerationInput) => { readonly title: string },
) =>
  Layer.succeed(TextGeneration)({
    generateThreadTitle: (input) => Effect.succeed(generate(input)),
    generateGitDraft: () => Effect.succeed({ title: "draft: test", body: "Generated in tests." }),
    generateBranchName: () => Effect.succeed({ branch: "generated-branch" }),
  })

const layer = (generate: (input: ThreadTitleGenerationInput) => { readonly title: string }) =>
  makeControlPlaneLayer().pipe(
    Layer.provideMerge(unavailableAgentSkillInstallerLayer),
    Layer.provideMerge(memoryLayer),
    Layer.provideMerge(testServerConfigLayer()),
    Layer.provideMerge(unavailableProviderLayer),
    Layer.provideMerge(staticProviderRegistryLayer),
    Layer.provideMerge(threadLiveLayer),
    Layer.provideMerge(noopDiscordPresenceLayer),
    Layer.provideMerge(stubGitRuntimeLayer),
    Layer.provideMerge(stubVcsStatusBroadcasterLayer()),
    Layer.provideMerge(stubTextGenerationLayer(generate)),
    Layer.provideMerge(
      Layer.succeed(WorkspaceRootAccess)({
        isAvailable: () => Effect.succeed(true),
      }),
    ),
    Layer.provideMerge(NodeFileSystem.layer),
    Layer.provideMerge(Path.layer),
    Layer.provide(Layer.succeed(Crypto.Crypto)(testCrypto())),
  )

const run = <A, E>(
  generate: (input: ThreadTitleGenerationInput) => { readonly title: string },
  effect: Effect.Effect<A, E, ControlPlane>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const services = yield* Layer.build(layer(generate))
      return yield* effect.pipe(Effect.provide(services))
    }),
  )

const seedProjectAndThread = Effect.fn("seedProjectAndThread")(function* (
  controlPlane: ControlPlane["Service"],
) {
  yield* controlPlane.dispatch(
    request({
      _tag: "project.create",
      commandId: uuid(1),
      payload: { projectId, name: "Noyau", workspaceRoot: "/tmp" },
    }),
    actorId,
  )
  yield* controlPlane.dispatch(
    request({
      _tag: "thread.create",
      commandId: uuid(2),
      payload: { threadId, projectId, title: DEFAULT_THREAD_TITLE },
    }),
    actorId,
  )
})

describe("Thread title reactor", () => {
  it.effect("replaces the first-turn seed with a generated title", () =>
    run(
      (input) => {
        assert.strictEqual(input.message, "Inspecte le flux de reprise")
        assert.isUndefined(input.previousTitle)
        return { title: "Fix session resume" }
      },
      Effect.gen(function* () {
        const controlPlane = yield* ControlPlane
        yield* seedProjectAndThread(controlPlane)
        yield* controlPlane.dispatch(
          request({
            _tag: "thread.turn.start",
            commandId: uuid(3),
            payload: {
              threadId,
              text: "Inspecte le flux de reprise",
              titleSeed: "Inspecte le flux de reprise",
            },
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
          assert.strictEqual(snapshot.snapshot.thread.title, "Fix session resume")
        }
      }),
    ),
  )

  it.effect("does not overwrite a user-renamed title", () =>
    run(
      () => ({ title: "Should not apply" }),
      Effect.gen(function* () {
        const controlPlane = yield* ControlPlane
        yield* seedProjectAndThread(controlPlane)
        yield* controlPlane.dispatch(
          request({
            _tag: "thread.meta.update",
            commandId: uuid(3),
            payload: { threadId, title: "Titre manuel" },
          }),
          actorId,
        )
        yield* controlPlane.dispatch(
          request({
            _tag: "thread.turn.start",
            commandId: uuid(4),
            payload: { threadId, text: "Inspecte le flux de reprise" },
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
          assert.strictEqual(snapshot.snapshot.thread.title, "Titre manuel")
        }
      }),
    ),
  )

  it.effect("regenerates from the transcript when asked", () =>
    run(
      (input) => {
        if (input.previousTitle === "Inspecte le flux de reprise") {
          assert.include(input.message, "USER: Inspecte le flux de reprise")
          return { title: "Resume Session Recovery" }
        }
        return { title: "Inspecte le flux de reprise" }
      },
      Effect.gen(function* () {
        const controlPlane = yield* ControlPlane
        yield* seedProjectAndThread(controlPlane)
        yield* controlPlane.dispatch(
          request({
            _tag: "thread.turn.start",
            commandId: uuid(3),
            payload: { threadId, text: "Inspecte le flux de reprise" },
          }),
          actorId,
        )
        yield* controlPlane.drainReactors
        yield* controlPlane.dispatch(
          request({
            _tag: "thread.meta.update",
            commandId: uuid(4),
            payload: { threadId, regenerateTitle: true },
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
          assert.strictEqual(snapshot.snapshot.thread.title, "Resume Session Recovery")
        }
      }),
    ),
  )
})

effectLayer(memoryLayer)("Thread title reactor SQL", (spec) => {
  spec.effect("bounds first-turn and post-generation reads", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient
      yield* sql`
        INSERT INTO projection_projects (
          project_id, name, workspace_root, available, created_at, updated_at
        ) VALUES (
          ${projectId}, 'Noyau', '/tmp', 1,
          '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
        )
      `
      yield* sql`
        INSERT INTO projection_threads (
          thread_id, project_id, title, provider, runtime_mode, status, created_at, updated_at
        ) VALUES
          (
          ${threadId}, ${projectId}, ${DEFAULT_THREAD_TITLE}, 'cursor', 'full-access', 'active',
          '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
          ),
          (
            ${zeroTurnThreadId}, ${projectId}, ${DEFAULT_THREAD_TITLE}, 'cursor', 'full-access', 'active',
            '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
          ),
          (
            ${multipleTurnThreadId}, ${projectId}, ${DEFAULT_THREAD_TITLE}, 'cursor', 'full-access', 'active',
            '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
          )
      `
      yield* sql`
        INSERT INTO projection_turns (
          turn_id, thread_id, ordinal, state, requested_at, started_at
        ) VALUES (
          ${titleTurnId}, ${threadId}, 1, 'running',
          '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
        )
      `
      yield* sql`
        INSERT INTO projection_turns (
          turn_id, thread_id, ordinal, state, requested_at, started_at
        ) VALUES
          (
            ${multipleTurnFirstId}, ${multipleTurnThreadId}, 1, 'completed',
            '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
          ),
          (
            ${multipleTurnSecondId}, ${multipleTurnThreadId}, 2, 'completed',
            '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
          )
      `

      const generationStarted = yield* Deferred.make<void>()
      const releaseGeneration = yield* Deferred.make<void>()
      let generationCalls = 0
      const textGeneration: TextGenerationService = {
        generateThreadTitle: (input) =>
          Effect.gen(function* () {
            generationCalls += 1
            assert.strictEqual(input.message, "Inspect this thread")
            if (generationCalls === 1) {
              yield* Deferred.succeed(generationStarted, undefined)
              yield* Deferred.await(releaseGeneration)
              return { title: "Generated title" }
            }
            return { title: "Unexpected title" }
          }),
        generateGitDraft: () => Effect.die("unused"),
        generateBranchName: () => Effect.die("unused"),
      }
      const dispatched: Array<InternalCommand> = []
      const dispatchInternal: DispatchInternal = (command) =>
        Effect.sync(() => {
          dispatched.push(command)
        })
      const queries: Array<string> = []
      const trackedSql = trackSql(sql, queries)
      const reactor = yield* makeThreadTitleReactor(dispatchInternal).pipe(
        Effect.provideService(SqlClient, trackedSql),
        Effect.provideService(Crypto.Crypto, testCrypto()),
        Effect.provideService(TextGeneration, textGeneration),
      )

      const fiber = yield* Effect.forkChild(
        reactor(
          persistedTitleEvent(
            ThreadTurnStarted.make({
              threadId,
              turnId: titleTurnId,
              text: "Inspect this thread",
              titleSeed: "Inspect this thread",
            }),
          ),
        ),
      )
      yield* Deferred.await(generationStarted)
      assert.isFalse(queries.some((query) => query.includes("projection_transcript")))

      yield* sql`
        UPDATE projection_threads SET title = 'Titre manuel' WHERE thread_id = ${threadId}
      `
      yield* Deferred.succeed(releaseGeneration, undefined)
      yield* Fiber.join(fiber)

      assert.strictEqual(dispatched.length, 0)
      assert.strictEqual(
        queries.filter((query) => query.includes("FROM projection_threads")).length,
        2,
      )
      assert.strictEqual(
        queries.filter((query) => query.includes("FROM projection_projects")).length,
        1,
      )
      assert.isFalse(queries.some((query) => query.includes("projection_transcript")))

      yield* reactor(
        persistedTitleEvent(
          ThreadTurnStarted.make({
            threadId: zeroTurnThreadId,
            turnId: zeroTurnEventId,
            text: "Zero-turn seed",
            titleSeed: "Zero-turn seed",
          }),
          { threadId: zeroTurnThreadId },
        ),
      )
      yield* reactor(
        persistedTitleEvent(
          ThreadTurnStarted.make({
            threadId: multipleTurnThreadId,
            turnId: multipleTurnSecondId,
            text: "Multiple-turn seed",
            titleSeed: "Multiple-turn seed",
          }),
          { threadId: multipleTurnThreadId },
        ),
      )
      assert.strictEqual(generationCalls, 1)
      assert.isFalse(queries.some((query) => query.includes("projection_transcript")))
      const rows = yield* sql<{ title: string }>`
        SELECT title FROM projection_threads WHERE thread_id = ${threadId}
      `
      assert.strictEqual(rows[0]?.title, "Titre manuel")
    }),
  )
})
