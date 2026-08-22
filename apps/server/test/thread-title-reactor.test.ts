import { createHash } from "node:crypto"

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, describe, it } from "@effect/vitest"
import { memoryLayer } from "@noyau/database/sqlite"
import { ClientCommandRequest } from "@noyau/protocol/commands"
import { ActorId, ProjectId, ThreadId } from "@noyau/protocol/ids"
import { DEFAULT_THREAD_TITLE } from "@noyau/protocol/thread/title"
import { ControlPlane, makeControlPlaneLayer } from "@noyau/server/control-plane"
import { noopDiscordPresenceLayer } from "@noyau/server/discord/presence"
import { unavailableProviderLayer } from "@noyau/server/provider/provider-port"
import {
  TextGeneration,
  type ThreadTitleGenerationInput,
} from "@noyau/server/text-generation/text-generation"
import { WorkspaceRootAccess } from "@noyau/server/workspace-root"
import { Crypto, Effect, Layer, Schema, Stream } from "effect"

import { testServerConfigLayer } from "./fixtures.ts"

const actorId = Schema.decodeSync(ActorId)("human:rpc-test")
const projectId = Schema.decodeSync(ProjectId)("10000000-0000-4000-8000-000000000001")
const threadId = Schema.decodeSync(ThreadId)("20000000-0000-4000-8000-000000000001")

const uuid = (index: number) => `30000000-0000-4000-8000-${index.toString().padStart(12, "0")}`

const request = (input: (typeof ClientCommandRequest)["Encoded"]) =>
  Schema.decodeSync(ClientCommandRequest)(input)

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
  })

const layer = (generate: (input: ThreadTitleGenerationInput) => { readonly title: string }) =>
  makeControlPlaneLayer().pipe(
    Layer.provideMerge(memoryLayer),
    Layer.provideMerge(testServerConfigLayer()),
    Layer.provideMerge(unavailableProviderLayer),
    Layer.provideMerge(noopDiscordPresenceLayer),
    Layer.provideMerge(stubTextGenerationLayer(generate)),
    Layer.provideMerge(
      Layer.succeed(WorkspaceRootAccess)({
        isAvailable: () => Effect.succeed(true),
      }),
    ),
    Layer.provideMerge(NodeFileSystem.layer),
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
