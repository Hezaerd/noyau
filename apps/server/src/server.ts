import * as NodeCrypto from "@effect/platform-node/NodeCrypto"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer"
import * as Sqlite from "@noyau/database/sqlite"
import type { Forbidden, MissingIdentity } from "@noyau/protocol/errors"
import { ControlPlaneRpcs } from "@noyau/protocol/rpc"
import { Effect, FileSystem, Layer, Path } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { RpcSerialization, RpcServer } from "effect/unstable/rpc"

import { ServerConfig, serverConfigLayer } from "./config.ts"
import { ControlPlane, controlPlaneLayer } from "./control-plane.ts"
import { discordPresenceLayer } from "./discord/ipc.ts"
import { authenticateBearer, rpcIdentityLayer } from "./identity.ts"
import { loggerLayer } from "./observability.ts"
import { cursorProviderLayer } from "./provider/cursor-acp.ts"
import { rpcHandlersLayer } from "./rpc-handlers.ts"
import { cursorTextGenerationLayer } from "./text-generation/cursor-text-generation.ts"
import { workspaceRootAccessLayer } from "./workspace-root.ts"

export const sqlitePersistenceLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig
    const fileSystem = yield* FileSystem.FileSystem
    yield* fileSystem.makeDirectory(config.dataDirectory, { recursive: true })
    return Sqlite.layer({ filename: config.databaseFile })
  }),
).pipe(Layer.provide(NodeFileSystem.layer))

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

const authenticateInternalRequest = Effect.fn("Server.authenticateInternalRequest")(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const config = yield* ServerConfig
  const token = new URL(request.url, "http://127.0.0.1").searchParams.get("token")
  return yield* authenticateBearer(
    request.headers.authorization ?? (token === null ? undefined : `Bearer ${token}`),
    config.bearerToken,
    config.actorId,
  )
})

const internalConfigRoute = HttpRouter.add(
  "GET",
  "/internal/config",
  Effect.gen(function* () {
    const actorId = yield* authenticateInternalRequest()
    const controlPlane = yield* ControlPlane
    const config = yield* controlPlane.getConfig
    return HttpServerResponse.jsonUnsafe({ ...config, actorId })
  }).pipe(Effect.catchTags({ MissingIdentity: unauthorized, Forbidden: unauthorized })),
)

const internalStatusRoute = HttpRouter.add(
  "GET",
  "/internal/status",
  Effect.gen(function* () {
    yield* authenticateInternalRequest()
    const controlPlane = yield* ControlPlane
    return HttpServerResponse.jsonUnsafe({
      runningTurn: yield* controlPlane.hasRunningTurn,
    })
  }).pipe(Effect.catchTags({ MissingIdentity: unauthorized, Forbidden: unauthorized })),
)

const internalShutdownRoute = HttpRouter.add(
  "POST",
  "/internal/shutdown",
  Effect.gen(function* () {
    yield* authenticateInternalRequest()
    const controlPlane = yield* ControlPlane
    yield* controlPlane.drainReactors
    yield* Effect.sync(() => {
      setImmediate(() => {
        process.exit(0)
      })
    })
    return HttpServerResponse.jsonUnsafe({ status: "shutting-down" })
  }).pipe(Effect.catchTags({ MissingIdentity: unauthorized, Forbidden: unauthorized })),
)

const protocolBearer = (value: string | undefined): string | undefined => {
  const token = value
    ?.split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith("noyau-bearer."))
  return token?.slice("noyau-bearer.".length)
}

export const websocketRpcLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig
    const controlPlane = yield* ControlPlane
    return HttpRouter.add(
      "GET",
      "/rpc",
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const queryToken = new URL(request.url, "http://127.0.0.1").searchParams.get("token")
        const bearer =
          request.headers.authorization ??
          protocolBearer(request.headers["sec-websocket-protocol"]) ??
          queryToken ??
          undefined
        const actorId = yield* authenticateBearer(
          bearer === undefined ? undefined : `Bearer ${bearer}`,
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

export const serverRoutesLayer = Layer.mergeAll(
  healthLayer,
  internalConfigRoute,
  internalStatusRoute,
  internalShutdownRoute,
  websocketRpcLayer,
)

export const nodeServerLayer = Layer.unwrap(
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
    const { createServer } = yield* Effect.promise(() => import("node:http"))
    return NodeHttpServer.layer(createServer, {
      host: config.host,
      port: config.port,
      gracefulShutdownTimeout: "20 seconds",
    })
  }),
)

export const infrastructureLayer = controlPlaneLayer.pipe(
  Layer.provideMerge(cursorProviderLayer()),
  Layer.provideMerge(cursorTextGenerationLayer()),
  Layer.provideMerge(workspaceRootAccessLayer),
  Layer.provide(discordPresenceLayer),
  Layer.provideMerge(
    sqlitePersistenceLayer.pipe(
      Layer.provideMerge(
        serverConfigLayer.pipe(Layer.provide(Layer.mergeAll(Path.layer, NodeFileSystem.layer))),
      ),
    ),
  ),
  Layer.provideMerge(NodeFileSystem.layer),
  Layer.provideMerge(Path.layer),
  Layer.provide(NodeCrypto.layer),
)

export const serverLayer = HttpRouter.serve(serverRoutesLayer).pipe(
  Layer.provide(nodeServerLayer),
  Layer.provide(loggerLayer),
  Layer.provide(infrastructureLayer),
  Layer.provide(NodeFileSystem.layer),
)
