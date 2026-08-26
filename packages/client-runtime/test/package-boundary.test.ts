import { describe, expect, it } from "@effect/vitest"
import * as connection from "@noyau/client-runtime/connection"
import * as platform from "@noyau/client-runtime/platform"
import * as rpc from "@noyau/client-runtime/rpc"
import * as stream from "@noyau/client-runtime/state/stream"
import * as testing from "@noyau/client-runtime/testing"
import { Effect, Schema } from "effect"

const PackageManifest = Schema.Struct({
  exports: Schema.Record(Schema.String, Schema.String),
  dependencies: Schema.Record(Schema.String, Schema.String),
  devDependencies: Schema.Record(Schema.String, Schema.String),
})

const forbiddenDependencies = [
  "react",
  "react-dom",
  "zustand",
  "@effect/atom-react",
  "@noyau/domain",
  "@noyau/web",
] as const

const loadPackageManifest = Effect.fn("loadPackageManifest")(function* () {
  const href = new URL("../../package.json", import.meta.resolve("@noyau/client-runtime/platform"))
    .href
  const loaded = yield* Effect.promise(() => import(href, { with: { type: "json" } }))
  const encoded = "default" in loaded ? loaded.default : loaded
  return yield* Schema.decodeUnknownEffect(PackageManifest)(encoded)
})

const rpcBootstrap = testing.rpcBootstrapLayer({
  rpcUrl: "ws://127.0.0.1:9/rpc",
  bearerToken: "test-token",
})
const recorder = testing.makeRecordingTechnicalReporter()

describe("frontière @noyau/client-runtime", () => {
  it("exporte les symboles attendus par subpath", () => {
    expect(platform.RpcBootstrap).toBeTypeOf("function")
    expect(platform.WebSocketConstructor).toBeDefined()
    expect(platform.TechnicalReporter).toBeTypeOf("function")

    expect(rpc.RpcSessionFactory).toBeTypeOf("function")
    expect(rpc.rpcSessionProtocolOptions.retryTransientErrors).toBe(false)
    expect(connection.ConnectionSupervisor).toBeTypeOf("function")
    expect(connection.classifyControlPlaneError).toBeTypeOf("function")
    expect(connection.TransportRupture).toBeTypeOf("function")

    expect(stream.acceptsSequence).toBeTypeOf("function")
    expect(stream.reduceSequencedFrame).toBeTypeOf("function")
    expect(stream.makeSequencedProjection).toBeTypeOf("function")

    expect(testing.makeTestRegistry).toBeTypeOf("function")
    expect(testing.makeRecordingTechnicalReporter).toBeTypeOf("function")
    expect(testing.rpcBootstrapLayer).toBeTypeOf("function")
    expect(testing.makeFakeRpcSession).toBeTypeOf("function")
  })

  it.effect("n'a pas d'export racine \".\"", () =>
    Effect.gen(function* () {
      const packageJson = yield* loadPackageManifest()
      expect(Object.hasOwn(packageJson.exports, ".")).toBe(false)
      expect(Object.keys(packageJson.exports).toSorted()).toEqual(
        [
          "./connection",
          "./connection/model",
          "./platform",
          "./rpc",
          "./state/stream",
          "./testing",
        ].toSorted(),
      )
    }),
  )

  it.effect("ne dépend pas de React, DOM, Zustand, Atom React, domain ou web", () =>
    Effect.gen(function* () {
      const packageJson = yield* loadPackageManifest()
      const declared = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      }
      expect(Object.keys(packageJson.dependencies).toSorted()).toEqual([
        "@noyau/protocol",
        "effect",
      ])
      for (const name of forbiddenDependencies) {
        expect(Object.hasOwn(declared, name)).toBe(false)
      }
    }),
  )
})

it.layer(rpcBootstrap)("RpcBootstrap de test", (t) => {
  t.effect("fournit rpcUrl et bearerToken", () =>
    Effect.gen(function* () {
      const bootstrap = yield* platform.RpcBootstrap
      expect(bootstrap.rpcUrl).toBe("ws://127.0.0.1:9/rpc")
      expect(bootstrap.bearerToken).toBe("test-token")
    }),
  )
})

it.layer(recorder.layer)("TechnicalReporter de test", (t) => {
  t.effect("enregistre les appels", () =>
    Effect.gen(function* () {
      const reporter = yield* platform.TechnicalReporter
      yield* reporter.report("boom", { incidentId: "inc-1", source: "test" })
      expect(recorder.reports).toEqual([
        { details: "boom", annotations: { incidentId: "inc-1", source: "test" } },
      ])
    }),
  )
})

describe("Registry Atom de test", () => {
  it("crée un Registry sans React", () => {
    const registry = testing.makeTestRegistry()
    expect(registry.dispose).toBeTypeOf("function")
    registry.dispose()
  })
})
