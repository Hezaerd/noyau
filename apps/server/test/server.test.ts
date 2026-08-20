import { assert, describe, it } from "@effect/vitest"
import { memoryLayer } from "@noyau/database/sqlite"
import { controlPlaneLayer } from "@noyau/server/control-plane"
import { serverRoutesLayer } from "@noyau/server/server"
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
      const [live, ready, missing, forbidden, stale] = await Promise.all([
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
      ])
      assert.strictEqual(live.status, 200)
      assert.strictEqual(ready.status, 200)
      assert.strictEqual(missing.status, 401)
      assert.strictEqual(forbidden.status, 403)
      assert.strictEqual(stale.status, 404)
    } finally {
      await dispose()
      await runtime.dispose()
    }
  })
})
