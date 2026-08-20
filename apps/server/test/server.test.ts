import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, describe, it } from "@effect/vitest"
import { memoryLayer } from "@noyau/database/sqlite"
import { controlPlaneLayer } from "@noyau/server/control-plane"
import { unavailableProviderLayer } from "@noyau/server/provider/provider-port"
import { serverRoutesLayer } from "@noyau/server/server"
import { WorkspaceRootAccess } from "@noyau/server/workspace-root"
import { Crypto, Effect, Layer, ManagedRuntime } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"

import { testServerConfigLayer } from "./fixtures"

const testCrypto = Crypto.make({
  randomBytes: (size) => new Uint8Array(size),
  digest: (_algorithm, data) => Effect.succeed(data),
})

const infrastructure = controlPlaneLayer.pipe(
  Layer.provideMerge(memoryLayer),
  Layer.provideMerge(testServerConfigLayer()),
  Layer.provideMerge(unavailableProviderLayer),
  Layer.provideMerge(
    Layer.succeed(WorkspaceRootAccess)({
      isAvailable: () => Effect.succeed(true),
    }),
  ),
  Layer.provideMerge(NodeFileSystem.layer),
  Layer.provide(Layer.succeed(Crypto.Crypto)(testCrypto)),
)

const routes = serverRoutesLayer.pipe(
  Layer.provide(HttpServer.layerServices),
  Layer.provide(infrastructure),
)

describe("server routes", () => {
  it("exposes readiness only after the control plane and protects the RPC upgrade", async () => {
    const runtime = ManagedRuntime.make(infrastructure)
    const context = await runtime.context()
    const { dispose, handler } = HttpRouter.toWebHandler(routes, { disableLogger: true })
    try {
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
      ] = await Promise.all([
        handler(new Request("http://localhost/health/live"), context),
        handler(new Request("http://localhost/health/ready"), context),
        handler(new Request("http://localhost/rpc"), context),
        handler(
          new Request("http://localhost/rpc", {
            headers: { authorization: "Bearer wrong-token" },
          }),
          context,
        ),
        handler(new Request("http://localhost/api/v1/projects/legacy/tasks"), context),
        handler(new Request("http://localhost/internal/config"), context),
        handler(
          new Request("http://localhost/internal/config", {
            headers: { authorization: "Bearer wrong-token" },
          }),
          context,
        ),
        handler(
          new Request("http://localhost/internal/config", {
            headers: { authorization: "Bearer test-launch-token" },
          }),
          context,
        ),
        handler(new Request("http://localhost/internal/status"), context),
        handler(
          new Request("http://localhost/internal/status", {
            headers: { authorization: "Bearer wrong-token" },
          }),
          context,
        ),
        handler(
          new Request("http://localhost/internal/status", {
            headers: { authorization: "Bearer test-launch-token" },
          }),
          context,
        ),
      ])
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
      assert.deepStrictEqual(await internalStatus.json(), { runningTurn: false })
    } finally {
      await dispose()
      await runtime.dispose()
    }
  })
})
