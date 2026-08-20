import { assert, describe, it } from "@effect/vitest"
import { Forbidden, MissingIdentity } from "@noyau/protocol/errors"
import { authenticateBearer, decodeConfiguredActor } from "@noyau/server/identity"
import { Effect, Redacted } from "effect"

describe("RPC identity", () => {
  it.effect("provides a decoded actor id", () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* decodeConfiguredActor("human:hezaerd"), "human:hezaerd")
    }),
  )

  it.effect("rejects an invalid configured actor", () =>
    Effect.gen(function* () {
      const missing = yield* decodeConfiguredActor("").pipe(Effect.flip)
      assert.instanceOf(missing, MissingIdentity)
    }),
  )

  it.effect("authenticates the launch bearer and returns the server-owned actor", () =>
    Effect.gen(function* () {
      const actor = yield* authenticateBearer(
        "Bearer launch-secret",
        Redacted.make("launch-secret"),
        "human:bootstrap",
      )
      assert.strictEqual(actor, "human:bootstrap")
    }),
  )

  it.effect("distinguishes missing credentials from a wrong bearer", () =>
    Effect.gen(function* () {
      const expected = Redacted.make("launch-secret")
      const missing = yield* authenticateBearer(undefined, expected, "human:bootstrap").pipe(
        Effect.flip,
      )
      const malformed = yield* authenticateBearer(
        "Basic launch-secret",
        expected,
        "human:bootstrap",
      ).pipe(Effect.flip)
      const forbidden = yield* authenticateBearer(
        "Bearer another-secret",
        expected,
        "human:bootstrap",
      ).pipe(Effect.flip)

      assert.instanceOf(missing, MissingIdentity)
      assert.instanceOf(malformed, MissingIdentity)
      assert.instanceOf(forbidden, Forbidden)
    }),
  )
})
