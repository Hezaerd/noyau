import {
  ConnectionSupervisor,
  connectionState,
  TransportRupture,
  type ConnectionState,
} from "@noyau/client-runtime/connection"
import { Effect, Layer, SubscriptionRef } from "effect"

export interface ControllableSupervisor {
  readonly layer: Layer.Layer<ConnectionSupervisor>
  readonly setState: (next: ConnectionState) => Effect.Effect<void>
  readonly getState: Effect.Effect<ConnectionState>
}

export const makeControllableSupervisor = (
  initial: ConnectionState = connectionState("connected", 1, 0),
): Effect.Effect<ControllableSupervisor> =>
  Effect.gen(function* () {
    const state = yield* SubscriptionRef.make(initial)
    const supervisor = ConnectionSupervisor.of({
      state,
      currentSession: Effect.fail(new TransportRupture({ reason: "failed" })),
      notifyTransportRupture: () => Effect.void,
      notifyFailure: () => Effect.void,
      start: Effect.void,
      stop: Effect.void,
    })
    return {
      layer: Layer.succeed(ConnectionSupervisor)(supervisor),
      setState: (next) => SubscriptionRef.set(state, next),
      getState: SubscriptionRef.get(state),
    }
  })
