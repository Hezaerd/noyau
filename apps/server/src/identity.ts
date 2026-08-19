import { CurrentActor, MissingIdentity } from "@noyau/protocol/errors"
import { ActorId } from "@noyau/protocol/ids"
import { NoyauRpcIdentity } from "@noyau/protocol/rpc"
import { Effect, Layer, Schema } from "effect"

import { ServerConfig } from "./config"

export class DevIdentityEnvironmentError extends Schema.TaggedError<DevIdentityEnvironmentError>()(
  "DevIdentityEnvironmentError",
  {
    environment: Schema.Literal("production"),
  },
) {}

const decodeActorId = Schema.decodeUnknownEffect(ActorId)

export const decodeDevActorId = (actorId: string) =>
  decodeActorId(actorId).pipe(Effect.mapError(() => new MissingIdentity()))

/** Identité de développement possédée par le serveur RPC. */
export const devIdentityLayer = Layer.effect(
  NoyauRpcIdentity,
  Effect.gen(function* () {
    const config = yield* ServerConfig
    if (config.environment === "production") {
      return yield* new DevIdentityEnvironmentError({
        environment: "production",
      })
    }
    const actorId = yield* decodeDevActorId(config.devActorId ?? "human:developer")
    yield* Effect.logInfo("Dev identity enabled").pipe(
      Effect.annotateLogs({
        actorId,
        environment: config.environment,
      }),
    )

    return NoyauRpcIdentity.of((effect) => Effect.provideService(effect, CurrentActor, actorId))
  }),
)
