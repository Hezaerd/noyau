import { assert, describe, it } from "@effect/vitest"
import { ControlPlaneConfig, type ControlPlaneConfigValue } from "@noyau/control-plane/config"
import {
  decodeDevActorCredential,
  DevIdentityEnvironmentError,
  devIdentityLayer,
} from "@noyau/control-plane/identity"
import { MissingIdentity } from "@noyau/protocol/control-plane"
import { Effect, Layer, Redacted } from "effect"

const config = (environment: ControlPlaneConfigValue["environment"]): ControlPlaneConfigValue => ({
  environment,
  databaseUrl: Redacted.make("postgresql://unused"),
  host: "127.0.0.1",
  port: 3001,
  eventPollInterval: 1,
})

const identityLayer = (environment: ControlPlaneConfigValue["environment"]) =>
  devIdentityLayer.pipe(Layer.provide(Layer.succeed(ControlPlaneConfig)(config(environment))))

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
