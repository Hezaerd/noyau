import { ServerConfig } from "@noyau/server/config"
import { Effect, Layer } from "effect"
import type * as Types from "effect/Types"
import { McpProtocol, McpServer } from "effect/unstable/ai"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"

import { McpInvocationContext } from "./mcp-invocation-context.ts"
import { McpSessionRegistry } from "./mcp-session-registry.ts"
import { NoyauMcpToolkit, NoyauMcpToolkitHandlersLive } from "./tools.ts"

const unauthorized = HttpServerResponse.jsonUnsafe(
  {
    error: "invalid_mcp_credential",
    message: "A valid Session-scoped Noyau MCP bearer credential is required.",
  },
  {
    status: 401,
    headers: {
      "cache-control": "no-store",
      "www-authenticate": "Bearer",
    },
  },
)

type AuthenticatedHttpEffect = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  Types.unhandled,
  McpInvocationContext
>

type McpAuthMiddleware = (
  httpEffect: AuthenticatedHttpEffect,
) => Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  Types.unhandled,
  HttpServerRequest.HttpServerRequest
>

const makeMcpAuthMiddleware = McpSessionRegistry.pipe(
  Effect.map((registry): McpAuthMiddleware =>
    Effect.fn("McpHttpServer.authenticateRequest")(function* (httpEffect) {
      const request = yield* HttpServerRequest.HttpServerRequest
      const authorization = request.headers.authorization
      const token =
        authorization?.startsWith("Bearer ") === true
          ? authorization.slice("Bearer ".length).trim()
          : ""
      const invocation = yield* registry.resolve(token)
      if (invocation === undefined) {
        return unauthorized
      }
      return yield* httpEffect.pipe(Effect.provideService(McpInvocationContext, invocation))
    }),
  ),
  Effect.withSpan("McpHttpServer.makeAuthMiddleware"),
)

const McpAuthMiddlewareLive = HttpRouter.middleware<{
  provides: McpInvocationContext
}>()(makeMcpAuthMiddleware).layer

const NoyauMcpToolkitRegistrationLive = McpServer.toolkit(NoyauMcpToolkit).pipe(
  Layer.provide(NoyauMcpToolkitHandlersLive),
)

const McpTransportLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig
    return McpServer.layerHttp({
      name: "Noyau",
      version: config.serverVersion,
      path: "/mcp",
      protocols: [McpProtocol.v2025_06_18],
    }).pipe(Layer.provide(McpAuthMiddlewareLive))
  }),
)

export const mcpHttpServerLayer = NoyauMcpToolkitRegistrationLive.pipe(
  Layer.provideMerge(McpTransportLive),
)
