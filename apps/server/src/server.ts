import * as BunHttpServer from "@effect/platform-bun/BunHttpServer"
import * as PgClient from "@effect/sql-pg/PgClient"
import { runMigrations } from "@noyau/database/migrations"
import { ControlPlaneRpcs } from "@noyau/protocol/rpc"
import { Context, Effect, Layer } from "effect"
import { HttpRouter, HttpServer, HttpServerResponse } from "effect/unstable/http"
import { RpcSerialization, RpcServer } from "effect/unstable/rpc"
import { SqlClient } from "effect/unstable/sql/SqlClient"

import { ServerConfig, serverConfigLayer } from "./config"
import { devIdentityLayer } from "./identity"
import { rpcHandlersLayer } from "./rpc-handlers"

export class MigrationsReady extends Context.Service<
  MigrationsReady,
  { readonly completed: true }
>()("@noyau/server/MigrationsReady") {}

export const postgresLayer = PgClient.layerFrom(
  Effect.gen(function* () {
    const config = yield* ServerConfig
    return yield* PgClient.make({
      url: config.databaseUrl,
      applicationName: "@noyau/server",
      maxConnections: 10,
    })
  }),
)

export const migrationsReadyLayer = Layer.effect(
  MigrationsReady,
  runMigrations.pipe(
    Effect.as(MigrationsReady.of({ completed: true })),
    Effect.withSpan("server.migrations"),
  ),
)

const readiness = Effect.gen(function* () {
  const sql = yield* SqlClient
  yield* sql`SELECT 1`
  return HttpServerResponse.jsonUnsafe({ status: "ready" })
}).pipe(
  Effect.catchTag("SqlError", (error) =>
    Effect.logError("PostgreSQL readiness check failed", error).pipe(
      Effect.as(HttpServerResponse.jsonUnsafe({ status: "unavailable" }, { status: 503 })),
    ),
  ),
)

const healthLayer = Layer.mergeAll(
  HttpRouter.add("GET", "/health/live", HttpServerResponse.jsonUnsafe({ status: "live" })),
  HttpRouter.add("GET", "/health/ready", readiness),
)

const rpcLayer = RpcServer.layerHttp({
  group: ControlPlaneRpcs,
  path: "/rpc",
}).pipe(
  Layer.provide(rpcHandlersLayer),
  Layer.provide(devIdentityLayer),
  Layer.provide(RpcSerialization.layerNdjson),
)

export const serverRoutesLayer = Layer.mergeAll(healthLayer, rpcLayer)

export const bunServerLayer = Layer.mergeAll(
  Layer.effect(
    HttpServer.HttpServer,
    Effect.gen(function* () {
      const config = yield* ServerConfig
      yield* MigrationsReady
      return yield* BunHttpServer.make({
        hostname: config.host,
        port: config.port,
        gracefulShutdownTimeout: "20 seconds",
      })
    }),
  ),
  BunHttpServer.layerHttpServices,
)

const infrastructureLayer = migrationsReadyLayer.pipe(
  Layer.provideMerge(postgresLayer.pipe(Layer.provideMerge(serverConfigLayer))),
)

export const serverLayer = HttpRouter.serve(serverRoutesLayer).pipe(
  Layer.provide(bunServerLayer),
  Layer.provide(infrastructureLayer),
)
