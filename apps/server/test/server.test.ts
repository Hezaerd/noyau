import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, describe, it } from "@effect/vitest"
import { memoryLayer } from "@noyau/database/sqlite"
import { controlPlaneLayer } from "@noyau/server/control-plane"
import { noopDiscordPresenceLayer } from "@noyau/server/discord/presence"
import { unavailableProviderLayer } from "@noyau/server/provider/provider-port"
import { serverRoutesLayer } from "@noyau/server/server"
import { unavailableTextGenerationLayer } from "@noyau/server/text-generation/text-generation"
import { WorkspaceRootAccess } from "@noyau/server/workspace-root"
import { Crypto, Effect, Layer, ManagedRuntime, Path } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"

import { testServerConfigLayer } from "./fixtures.ts"

const testCrypto = Crypto.make({
  randomBytes: (size) => new Uint8Array(size),
  digest: (_algorithm, data) => Effect.succeed(data),
})

const infrastructure = controlPlaneLayer.pipe(
  Layer.provideMerge(memoryLayer),
  Layer.provideMerge(testServerConfigLayer()),
  Layer.provideMerge(unavailableProviderLayer),
  Layer.provideMerge(unavailableTextGenerationLayer),
  Layer.provideMerge(noopDiscordPresenceLayer),
  Layer.provideMerge(
    Layer.succeed(WorkspaceRootAccess)({
      isAvailable: () => Effect.succeed(true),
    }),
  ),
  Layer.provideMerge(NodeFileSystem.layer),
  Layer.provideMerge(Path.layer),
  Layer.provide(Layer.succeed(Crypto.Crypto)(testCrypto)),
)

const routes = serverRoutesLayer.pipe(
  Layer.provide(HttpServer.layerServices),
  Layer.provide(infrastructure),
)

describe("server routes", () => {
  it.effect("exposes readiness only after the control plane and protects the RPC upgrade", () =>
    Effect.gen(function* () {
      const runtime = ManagedRuntime.make(infrastructure)
      yield* Effect.addFinalizer(() => Effect.promise(() => runtime.dispose()))
      const context = yield* Effect.promise(() => runtime.context())
      const { dispose, handler } = HttpRouter.toWebHandler(routes, { disableLogger: true })
      yield* Effect.addFinalizer(() => Effect.promise(() => dispose()))
      const request = (url: string, init?: RequestInit) =>
        Effect.promise(() => handler(new Request(url, init), context))
      const [
        live,
        ready,
        missing,
        forbidden,
        stale,
        internalMissing,
        internalForbidden,
        internalConfig,
        internalStatusMissing,
        internalStatusForbidden,
        internalStatus,
      ] = yield* Effect.all(
        [
          request("http://localhost/health/live"),
          request("http://localhost/health/ready"),
          request("http://localhost/rpc"),
          request("http://localhost/rpc", {
            headers: { authorization: "Bearer wrong-token" },
          }),
          request("http://localhost/api/v1/projects/legacy/tasks"),
          request("http://localhost/internal/config"),
          request("http://localhost/internal/config", {
            headers: { authorization: "Bearer wrong-token" },
          }),
          request("http://localhost/internal/config", {
            headers: { authorization: "Bearer test-launch-token" },
          }),
          request("http://localhost/internal/status"),
          request("http://localhost/internal/status", {
            headers: { authorization: "Bearer wrong-token" },
          }),
          request("http://localhost/internal/status", {
            headers: { authorization: "Bearer test-launch-token" },
          }),
        ],
        { concurrency: "unbounded" },
      )
      assert.strictEqual(live.status, 200)
      assert.strictEqual(ready.status, 200)
      assert.strictEqual(missing.status, 401)
      assert.strictEqual(forbidden.status, 403)
      assert.strictEqual(stale.status, 404)
      assert.strictEqual(internalMissing.status, 401)
      assert.strictEqual(internalForbidden.status, 403)
      assert.strictEqual(internalConfig.status, 200)
      assert.strictEqual(internalStatusMissing.status, 401)
      assert.strictEqual(internalStatusForbidden.status, 403)
      assert.strictEqual(internalStatus.status, 200)
      assert.deepStrictEqual(yield* Effect.promise(() => internalStatus.json()), {
        runningTurn: false,
      })
    }),
  )
})
