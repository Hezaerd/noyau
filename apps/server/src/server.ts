import * as BunHttpServer from "@effect/platform-bun/BunHttpServer"
import * as PgClient from "@effect/sql-pg/PgClient"
import { runMigrations } from "@noyau/database/migrations"
import { ControlPlaneApi } from "@noyau/protocol/control-plane"
import { ControlPlaneRpcs } from "@noyau/protocol/rpc"
import { Context, Effect, Layer } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApiBuilder, HttpApiScalar } from "effect/unstable/httpapi"
import { RpcSerialization, RpcServer } from "effect/unstable/rpc"

import { ServerConfig, serverConfigLayer } from "./config"
import { healthHandlersLayer, projectHandlersLayer } from "./handlers"
import { devIdentityLayer, devRpcIdentityLayer } from "./identity"
import { requestSchemaErrorsLayer } from "./request-errors"
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

const docsLayer = Layer.unwrap(
  Effect.map(ServerConfig, (config) =>
    config.environment === "development" ? HttpApiScalar.layer(ControlPlaneApi) : Layer.empty,
  ),
)

const apiLayer = HttpApiBuilder.layer(ControlPlaneApi).pipe(
  Layer.provide(projectHandlersLayer),
  Layer.provide(healthHandlersLayer),
  Layer.provide(devIdentityLayer),
  Layer.provide(requestSchemaErrorsLayer),
)

const rpcLayer = RpcServer.layerHttp({
  group: ControlPlaneRpcs,
  path: "/rpc",
}).pipe(
  Layer.provide(rpcHandlersLayer),
  Layer.provide(devRpcIdentityLayer),
  Layer.provide(RpcSerialization.layerNdjson),
)

export const serverRoutesLayer = Layer.mergeAll(apiLayer, docsLayer, rpcLayer)

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
