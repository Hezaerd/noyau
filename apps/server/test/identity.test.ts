import { assert, describe, it } from "@effect/vitest"
import { MissingIdentity } from "@noyau/protocol/control-plane"
import { ServerConfig, type ServerConfigValue } from "@noyau/server/config"
import {
  decodeDevActorCredential,
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
})

const identityLayer = (environment: ServerConfigValue["environment"]) =>
  devIdentityLayer.pipe(Layer.provide(Layer.succeed(ServerConfig)(config(environment))))

describe("DevIdentity", () => {
  it.effect("provides a decoded actor id", () =>
    Effect.gen(function* () {
      assert.strictEqual(
        yield* decodeDevActorCredential(Redacted.make("human:hezaerd")),
        "human:hezaerd",
      )
    }),
  )

  it.effect("rejects a missing or invalid header", () =>
    Effect.gen(function* () {
      const missing = yield* decodeDevActorCredential(Redacted.make("")).pipe(Effect.flip)
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
