import { assert, describe, it } from "@effect/vitest"
import { MissingIdentity } from "@noyau/protocol/errors"
import { ServerConfig, type ServerConfigValue } from "@noyau/server/config"
import {
  decodeDevActorId,
  DevIdentityEnvironmentError,
  devIdentityLayer,
} from "@noyau/server/identity"
import { Effect, Layer, Redacted } from "effect"

const config = (environment: ServerConfigValue["environment"]): ServerConfigValue => ({
  environment,
  databaseUrl: Redacted.make("postgresql://unused"),
  host: "127.0.0.1",
  port: 3001,
  eventPollInterval: 1,
  devActorId: "human:hezaerd",
})

const identityLayer = (environment: ServerConfigValue["environment"]) =>
  devIdentityLayer.pipe(Layer.provide(Layer.succeed(ServerConfig)(config(environment))))

describe("DevIdentity", () => {
  it.effect("provides a decoded actor id", () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* decodeDevActorId("human:hezaerd"), "human:hezaerd")
    }),
  )

  it.effect("rejects an invalid configured actor", () =>
    Effect.gen(function* () {
      const missing = yield* decodeDevActorId("").pipe(Effect.flip)
      assert.instanceOf(missing, MissingIdentity)
    }),
  )

  it.effect("refuses to construct in production", () =>
    Effect.gen(function* () {
      const error = yield* Layer.build(identityLayer("production")).pipe(Effect.scoped, Effect.flip)
      assert.instanceOf(error, DevIdentityEnvironmentError)
    }),
  )
})
