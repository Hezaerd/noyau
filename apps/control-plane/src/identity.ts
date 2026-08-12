import { CurrentActor, MissingIdentity, NoyauIdentity } from "@noyau/protocol/control-plane"
import { ActorId } from "@noyau/protocol/ids"
import { Effect, Layer, Redacted, Schema } from "effect"

import { ControlPlaneConfig } from "./config"

export class DevIdentityEnvironmentError extends Schema.TaggedError<DevIdentityEnvironmentError>()(
  "DevIdentityEnvironmentError",
  {
    environment: Schema.Literal("production"),
  },
) {}

const decodeActorId = Schema.decodeUnknownEffect(ActorId)

export const decodeDevActorCredential = (credential: Redacted.Redacted) =>
  decodeActorId(Redacted.value(credential)).pipe(Effect.mapError(() => new MissingIdentity()))

export const devIdentityLayer = Layer.effect(
  NoyauIdentity,
  Effect.gen(function* () {
    const config = yield* ControlPlaneConfig
    if (config.environment === "production") {
      return yield* new DevIdentityEnvironmentError({
        environment: "production",
      })
    }

    return NoyauIdentity.of({
      actorId: (httpEffect, { credential }) =>
        decodeDevActorCredential(credential).pipe(
          Effect.flatMap((actorId) => Effect.provideService(httpEffect, CurrentActor, actorId)),
        ),
    })
  }),
)
