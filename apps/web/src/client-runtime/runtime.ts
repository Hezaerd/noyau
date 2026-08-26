import { ConnectionSupervisor } from "@noyau/client-runtime/connection"
import { RpcBootstrap } from "@noyau/client-runtime/platform"
import { RpcSessionFactory } from "@noyau/client-runtime/rpc"
import { Crypto, Effect, Layer, ManagedRuntime } from "effect"
import { Atom } from "effect/unstable/reactivity"
import { Socket } from "effect/unstable/socket"

import { controlPlaneConfig } from "@/lib/control-plane-config"

const browserCrypto = Crypto.make({
  randomBytes: (size) => globalThis.crypto.getRandomValues(new Uint8Array(size)),
  digest: (algorithm, data) => {
    const input = new Uint8Array(data)
    return Effect.promise(() =>
      globalThis.crypto.subtle.digest(algorithm, input).then((digest) => new Uint8Array(digest)),
    )
  },
})

export const controlPlaneLayer = ConnectionSupervisor.layer.pipe(
  Layer.provideMerge(RpcSessionFactory.layer),
  Layer.provideMerge(
    RpcBootstrap.layer({
      rpcUrl: controlPlaneConfig.rpcUrl,
      bearerToken: controlPlaneConfig.bearerToken,
    }),
  ),
  Layer.provideMerge(Socket.layerWebSocketConstructorGlobal),
  Layer.provideMerge(Layer.succeed(Crypto.Crypto)(browserCrypto)),
)

/**
 * Unique ManagedRuntime of the renderer. Query/command façade and Atom.runtime
 * both read ConnectionSupervisor from this instance — one supervisor, one
 * WebSocket.
 */
export const controlPlaneRuntime = ManagedRuntime.make(controlPlaneLayer)

/**
 * Provide the supervisor already built by `controlPlaneRuntime`. Do not
 * `Atom.runtime(ConnectionSupervisor.layer)`: that would open a second session.
 */
export const sharedSupervisorLayer = Layer.effect(
  ConnectionSupervisor,
  Effect.gen(function* () {
    const supervisor = yield* Effect.promise(() =>
      controlPlaneRuntime.runPromise(ConnectionSupervisor),
    )
    yield* supervisor.start
    return supervisor
  }),
)

export const clientAtomRuntime = Atom.runtime(sharedSupervisorLayer)
