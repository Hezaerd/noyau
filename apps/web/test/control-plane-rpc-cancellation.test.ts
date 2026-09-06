import { Cause, Context, Deferred, Effect, Exit, Layer, ManagedRuntime, Schema } from "effect"
import { Rpc, RpcGroup, RpcTest } from "effect/unstable/rpc"
import type * as RpcClient from "effect/unstable/rpc/RpcClient"
import { describe, expect, it } from "vitest"

describe("control plane RPC cancellation", () => {
  it("interrupts a dispatched RPC handler when the ManagedRuntime caller aborts", async () => {
    const handlerEntered = Deferred.makeUnsafe<void>()
    const handlerFinalized = Deferred.makeUnsafe<void>()
    const rpcs = RpcGroup.make(
      Rpc.make("searchPaths", {
        payload: Schema.Struct({ query: Schema.String }),
        success: Schema.Array(Schema.String),
      }),
    )
    const handlers = rpcs.toLayerHandler("searchPaths", () =>
      Deferred.succeed(handlerEntered, undefined).pipe(
        Effect.andThen(Effect.never),
        Effect.ensuring(Deferred.succeed(handlerFinalized, undefined)),
      ),
    )
    class Client extends Context.Service<Client, RpcClient.RpcClient<RpcGroup.Rpcs<typeof rpcs>>>()(
      "test/SearchPathsClient",
    ) {}
    const clientLayer = Layer.effect(Client, RpcTest.makeClient(rpcs)).pipe(Layer.provide(handlers))
    const runtime = ManagedRuntime.make(clientLayer)
    const controller = new AbortController()
    try {
      const request = runtime.runPromiseExit(
        Client.pipe(Effect.flatMap((client) => client.searchPaths({ query: "adapter" }))),
        { signal: controller.signal },
      )

      await Effect.runPromise(Deferred.await(handlerEntered))
      controller.abort()
      const exit = await request
      await Effect.runPromise(Deferred.await(handlerFinalized))

      expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
    } finally {
      await runtime.dispose()
    }
  })
})
