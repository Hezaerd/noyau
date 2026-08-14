import { CurrentActor, MissingIdentity, NoyauIdentity } from "@noyau/protocol/control-plane"
import { ActorId } from "@noyau/protocol/ids"
import { NoyauRpcIdentity } from "@noyau/protocol/rpc"
import { Effect, Layer, Redacted, Schema } from "effect"

import { ServerConfig } from "./config"

export class DevIdentityEnvironmentError extends Schema.TaggedError<DevIdentityEnvironmentError>()(
  "DevIdentityEnvironmentError",
  {
    environment: Schema.Literal("production"),
  },
) {}

const decodeActorId = Schema.decodeUnknownEffect(ActorId)

export const decodeDevActorCredential = (credential: Redacted.Redacted) =>
  decodeActorId(Redacted.value(credential)).pipe(Effect.mapError(() => new MissingIdentity()))

export const decodeDevActorId = (actorId: string) =>
  decodeActorId(actorId).pipe(Effect.mapError(() => new MissingIdentity()))

export const devIdentityLayer = Layer.effect(
  NoyauIdentity,
  Effect.gen(function* () {
    const config = yield* ServerConfig
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

/**
 * Identité de développement possédée par le serveur RPC. Contrairement à
 * l'ancien client sandbox, le navigateur ne peut pas choisir son acteur.
 */
export const devRpcIdentityLayer = Layer.effect(
  NoyauRpcIdentity,
  Effect.gen(function* () {
    const config = yield* ServerConfig
    if (config.environment === "production") {
      return yield* new DevIdentityEnvironmentError({
        environment: "production",
      })
    }
    const actorId = yield* decodeDevActorId(config.devActorId ?? "human:developer")

    return NoyauRpcIdentity.of((effect) =>
      Effect.provideService(effect, CurrentActor, actorId),
    )
  }),
)
