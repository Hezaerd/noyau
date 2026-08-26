import { TransportRupture } from "@noyau/client-runtime/connection/model"
import {
  RpcBootstrap,
  WebSocketConstructor,
  type RpcBootstrapConfig,
} from "@noyau/client-runtime/platform"
import { ControlPlaneRpcs } from "@noyau/protocol/rpc"
import { Context, Deferred, Effect, Exit, Layer, Ref, Schedule, Scope } from "effect"
import { RpcClient, RpcSerialization } from "effect/unstable/rpc"
import type { RpcClientError } from "effect/unstable/rpc/RpcClientError"
import type * as RpcGroup from "effect/unstable/rpc/RpcGroup"
import { Socket } from "effect/unstable/socket"

export type ControlPlaneRpcClient = RpcClient.RpcClient<
  RpcGroup.Rpcs<typeof ControlPlaneRpcs>,
  RpcClientError
>

export interface RpcSession {
  readonly generation: number
  readonly client: ControlPlaneRpcClient
  readonly ready: Effect.Effect<void, TransportRupture>
  readonly closed: Effect.Effect<never, TransportRupture>
  readonly dispose: Effect.Effect<void>
}

export class RpcSessionFactory extends Context.Service<
  RpcSessionFactory,
  {
    readonly connect: (generation: number) => Effect.Effect<RpcSession, TransportRupture>
  }
>()("@noyau/client-runtime/rpc/session/RpcSessionFactory") {
  static layer: Layer.Layer<RpcSessionFactory, never, RpcBootstrap | Socket.WebSocketConstructor>
}

/** Session owns one attempt. The supervisor is the only retry owner. */
export const rpcSessionProtocolOptions = {
  retryTransientErrors: false,
  retryPolicy: Schedule.recurs(0),
} as const

export const rpcSocketUrl = (config: RpcBootstrapConfig): string => {
  const rpcUrl = new URL(config.rpcUrl)
  rpcUrl.searchParams.set("token", config.bearerToken)
  return rpcUrl.toString()
}

const make = Effect.gen(function* () {
  const bootstrap = yield* RpcBootstrap
  const webSocketConstructor = yield* WebSocketConstructor

  const connect = Effect.fn("RpcSessionFactory.connect")(function* (generation: number) {
    const sessionScope = yield* Scope.make()
    const disposed = yield* Ref.make(false)
    const connected = yield* Deferred.make<void>()
    const disconnected = yield* Deferred.make<never, TransportRupture>()
    const hooks = RpcClient.ConnectionHooks.of({
      onConnect: Deferred.succeed(connected, undefined).pipe(Effect.asVoid),
      onDisconnect: Deferred.isDone(connected).pipe(
        Effect.flatMap((wasConnected) =>
          Deferred.fail(
            disconnected,
            new TransportRupture({
              reason: wasConnected ? "ended" : "failed",
            }),
          ),
        ),
        Effect.asVoid,
      ),
    })
    const socketLayer = Socket.layerWebSocket(rpcSocketUrl(bootstrap)).pipe(
      Layer.provide(Layer.succeed(Socket.WebSocketConstructor, webSocketConstructor)),
    )
    const protocolLayer = Layer.effect(
      RpcClient.Protocol,
      RpcClient.makeProtocolSocket(rpcSessionProtocolOptions),
    ).pipe(
      Layer.provide(
        Layer.mergeAll(
          socketLayer,
          RpcSerialization.layerJson,
          Layer.succeed(RpcClient.ConnectionHooks, hooks),
        ),
      ),
    )
    const protocolContext = yield* Layer.buildWithScope(protocolLayer, sessionScope)
    const client = yield* RpcClient.make(ControlPlaneRpcs).pipe(
      Effect.provide(protocolContext),
      Scope.provide(sessionScope),
    )
    const dispose = Ref.getAndSet(disposed, true).pipe(
      Effect.flatMap((already) => (already ? Effect.void : Scope.close(sessionScope, Exit.void))),
    )

    return {
      generation,
      client,
      ready: Deferred.await(connected).pipe(
        Effect.asVoid,
        Effect.raceFirst(Deferred.await(disconnected)),
      ),
      closed: Deferred.await(disconnected),
      dispose,
    } satisfies RpcSession
  })

  return RpcSessionFactory.of({ connect })
})

export const layer: Layer.Layer<
  RpcSessionFactory,
  never,
  RpcBootstrap | Socket.WebSocketConstructor
> = Layer.effect(RpcSessionFactory, make)
RpcSessionFactory.layer = layer
