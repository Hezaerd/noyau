import { closeSync, openSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { assert, describe, it } from "@effect/vitest"
import { BootstrapConfigError, decodeBootstrap, readBootstrapFd } from "@noyau/server/config"
import { Effect } from "effect"

const bootstrap = {
  dataDirectory: "/tmp/noyau",
  host: "127.0.0.1",
  port: 0,
  bearerToken: "launch-token",
  actorId: "human:bootstrap",
  environmentId: "90000000-0000-4000-8000-000000000001",
  environmentCreatedAt: "2026-08-20T00:00:00.000Z",
  bootstrapVersion: "1",
  bundleVersion: "0.1.0",
  serverVersion: "0.1.0",
}

describe("server bootstrap", () => {
  it.effect("decodes the same contract used by config and fd3", () =>
    Effect.gen(function* () {
      const encoded = JSON.stringify(bootstrap)
      const path = join(tmpdir(), `noyau-bootstrap-${process.pid}.json`)
      writeFileSync(path, encoded)
      const fd = openSync(path, "r")
      const direct = yield* decodeBootstrap("test", encoded)
      const fromFd = yield* readBootstrapFd(fd).pipe(
        Effect.ensuring(Effect.sync(() => closeSync(fd))),
      )

      assert.deepStrictEqual(fromFd, direct)
      assert.strictEqual(fromFd.actorId, "human:bootstrap")
      assert.strictEqual(fromFd.port, 0)
    }),
  )

  it.effect("rejects non-loopback bootstrap hosts", () =>
    Effect.gen(function* () {
      const error = yield* decodeBootstrap(
        "test",
        JSON.stringify({ ...bootstrap, host: "0.0.0.0" }),
      ).pipe(Effect.flip)
      assert.instanceOf(error, BootstrapConfigError)
    }),
  )
})
