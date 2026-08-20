import * as BunCrypto from "@effect/platform-bun/BunCrypto"
import * as BunFileSystem from "@effect/platform-bun/BunFileSystem"
import * as BunHttpServer from "@effect/platform-bun/BunHttpServer"
import * as Sqlite from "@noyau/database/sqlite"
import type { Forbidden, MissingIdentity } from "@noyau/protocol/errors"
import { ControlPlaneRpcs } from "@noyau/protocol/rpc"
import { Effect, FileSystem, Layer } from "effect"
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { RpcSerialization, RpcServer } from "effect/unstable/rpc"

import { ServerConfig, serverConfigLayer } from "./config"
import { ControlPlane, controlPlaneLayer } from "./control-plane"
import { authenticateBearer, rpcIdentityLayer } from "./identity"
import { loggerLayer } from "./observability"
import { cursorProviderLayer } from "./provider/cursor-acp"
import { rpcHandlersLayer } from "./rpc-handlers"

export const sqlitePersistenceLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig
    const fileSystem = yield* FileSystem.FileSystem
    yield* fileSystem.makeDirectory(config.dataDirectory, { recursive: true })
    return Sqlite.layer({ filename: config.databaseFile })
  }),
).pipe(Layer.provide(BunFileSystem.layer))

const healthLayer = Layer.mergeAll(
  HttpRouter.add("GET", "/health/live", HttpServerResponse.jsonUnsafe({ status: "live" })),
  HttpRouter.add("GET", "/health/ready", HttpServerResponse.jsonUnsafe({ status: "ready" })),
)

const unauthorized = (error: MissingIdentity | Forbidden) =>
  Effect.succeed(
    HttpServerResponse.jsonUnsafe(
      { error: error._tag },
      { status: error._tag === "MissingIdentity" ? 401 : 403 },
    ),
  )

export const websocketRpcLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig
    const controlPlane = yield* ControlPlane
    return HttpRouter.add(
      "GET",
      "/rpc",
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const actorId = yield* authenticateBearer(
          request.headers.authorization,
          config.bearerToken,
          config.actorId,
        )
        const connectionLayer = rpcHandlersLayer.pipe(
          Layer.provideMerge(rpcIdentityLayer(actorId)),
          Layer.provide(Layer.succeed(ControlPlane)(controlPlane)),
          Layer.provideMerge(RpcSerialization.layerJson),
        )
        const connection = yield* Layer.build(connectionLayer)
        const websocket = yield* RpcServer.toHttpEffectWebsocket(ControlPlaneRpcs).pipe(
          Effect.provideContext(connection),
        )
        return yield* websocket
      }).pipe(Effect.catchTags({ MissingIdentity: unauthorized, Forbidden: unauthorized })),
    )
  }),
)

export const serverRoutesLayer = Layer.mergeAll(healthLayer, websocketRpcLayer)

export const bunServerLayer = Layer.mergeAll(
  Layer.effect(
    HttpServer.HttpServer,
    Effect.gen(function* () {
      const config = yield* ServerConfig
      yield* ControlPlane
      yield* Effect.logInfo("Noyau Server listening").pipe(
        Effect.annotateLogs({
          environment: config.environment,
          host: config.host,
          port: config.port,
        }),
      )
      return yield* BunHttpServer.make({
        hostname: config.host,
        port: config.port,
        gracefulShutdownTimeout: "20 seconds",
      })
    }),
  ),
  BunHttpServer.layerHttpServices,
)

export const infrastructureLayer = controlPlaneLayer.pipe(
  Layer.provideMerge(cursorProviderLayer()),
  Layer.provideMerge(sqlitePersistenceLayer.pipe(Layer.provideMerge(serverConfigLayer))),
  Layer.provide(BunCrypto.layer),
)

export const serverLayer = HttpRouter.serve(serverRoutesLayer).pipe(
  Layer.provide(bunServerLayer),
  Layer.provide(loggerLayer),
  Layer.provide(infrastructureLayer),
)
