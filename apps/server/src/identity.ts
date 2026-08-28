import { timingSafeEqual } from "node:crypto"

import { CurrentActor, Forbidden, MissingIdentity } from "@noyau/contracts/errors"
import { ActorId, type ActorId as ActorIdType } from "@noyau/contracts/ids"
import { NoyauRpcIdentity } from "@noyau/contracts/rpc"
import { Effect, Layer, Redacted, Schema } from "effect"

const decodeActorId = Schema.decodeUnknownEffect(ActorId)

export const decodeConfiguredActor = (actorId: string) =>
  decodeActorId(actorId).pipe(Effect.mapError(() => new MissingIdentity()))

const bearerValue = (authorization: string): string | undefined => {
  const prefix = "Bearer "
  return authorization.startsWith(prefix) ? authorization.slice(prefix.length) : undefined
}

const securelyEqual = (left: string, right: string): boolean => {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

/** Authentifie le bearer de lancement avant l'upgrade WebSocket. */
export const authenticateBearer = Effect.fn("Identity.authenticateBearer")(function* (
  authorization: string | undefined,
  expected: Redacted.Redacted,
  configuredActor: string,
) {
  if (authorization === undefined) {
    return yield* new MissingIdentity()
  }
  const bearer = bearerValue(authorization)
  if (bearer === undefined || bearer.length === 0) {
    return yield* new MissingIdentity()
  }
  if (!securelyEqual(bearer, Redacted.value(expected))) {
    return yield* new Forbidden()
  }
  return yield* decodeConfiguredActor(configuredActor)
})

/** Fournit aux handlers l'acteur bootstrapé, jamais une identité issue du payload. */
export const rpcIdentityLayer = (actorId: ActorIdType) =>
  Layer.succeed(NoyauRpcIdentity)(
    NoyauRpcIdentity.of((effect) => Effect.provideService(effect, CurrentActor, actorId)),
  )
