import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, layer } from "@effect/vitest"
import {
  BootstrapConfig,
  BootstrapConfigError,
  decodeBootstrap,
  readBootstrapFd,
} from "@noyau/server/config"
import { Effect, FileSystem, Layer, Path, Schema } from "effect"

const encodeBootstrapJson = Schema.encodeEffect(Schema.fromJsonString(BootstrapConfig))
const BootstrapWire = Schema.Struct({
  dataDirectory: Schema.String,
  host: Schema.String,
  port: Schema.Int,
  bearerToken: Schema.String,
  actorId: Schema.String,
  environmentId: Schema.String,
  environmentCreatedAt: Schema.String,
  bootstrapVersion: Schema.String,
  bundleVersion: Schema.String,
  serverVersion: Schema.String,
})
const encodeBootstrapWire = Schema.encodeEffect(Schema.fromJsonString(BootstrapWire))
const NodeFileDescriptor = Schema.Struct({
  fd: Schema.Int,
})

const bootstrap = {
  dataDirectory: "/tmp/noyau",
  host: "127.0.0.1" as const,
  port: 0,
  bearerToken: "launch-token",
  actorId: "human:bootstrap",
  environmentId: "90000000-0000-4000-8000-000000000001",
  environmentCreatedAt: "2026-08-20T00:00:00.000Z",
  bootstrapVersion: "1",
  bundleVersion: "0.1.0",
  serverVersion: "0.1.0",
}

const platformLayer = Layer.mergeAll(NodeFileSystem.layer, Path.layer)

layer(platformLayer)("server bootstrap", (it) => {
  it.effect("decodes the same contract used by config and fd3", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const decoded = yield* Schema.decodeEffect(BootstrapConfig)(bootstrap)
      const encoded = yield* encodeBootstrapJson(decoded)
      const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-bootstrap-" })
      const filePath = path.join(directory, "bootstrap.json")
      yield* fileSystem.writeFileString(filePath, encoded)
      const file = yield* fileSystem.open(filePath, { flag: "r" })
      const { fd } = yield* Schema.decodeUnknownEffect(NodeFileDescriptor)(file)
      const direct = yield* decodeBootstrap("test", encoded)
      const fromFd = yield* readBootstrapFd(fd)

      assert.deepStrictEqual(fromFd, direct)
      assert.strictEqual(fromFd.actorId, "human:bootstrap")
      assert.strictEqual(fromFd.port, 0)
    }),
  )

  it.effect("rejects non-loopback bootstrap hosts", () =>
    Effect.gen(function* () {
      const encoded = yield* encodeBootstrapWire({ ...bootstrap, host: "0.0.0.0" })
      const error = yield* decodeBootstrap("test", encoded).pipe(Effect.flip)
      assert.instanceOf(error, BootstrapConfigError)
    }),
  )
})
