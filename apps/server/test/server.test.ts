import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, describe, it } from "@effect/vitest"
import { ActorId, EnvironmentId, ProjectId, ThreadId, TurnId } from "@noyau/protocol/ids"
import { unavailableAgentSkillInstallerLayer } from "@noyau/server/agent-skill/installer"
import { controlPlaneLayer } from "@noyau/server/control-plane"
import { noopDiscordPresenceLayer } from "@noyau/server/discord/presence"
import { McpSessionRegistry } from "@noyau/server/mcp/mcp-session-registry"
import { memoryLayer } from "@noyau/server/persistence/sqlite"
import { unavailableProviderLayer } from "@noyau/server/provider/provider-port"
import { turnUserInputRegistryLayer } from "@noyau/server/provider/turn-user-input-registry"
import { serverRoutesLayer } from "@noyau/server/server"
import { unavailableTextGenerationLayer } from "@noyau/server/text-generation/text-generation"
import { threadLiveLayer } from "@noyau/server/thread-live"
import { WorkspaceRootAccess } from "@noyau/server/workspace-root"
import { Context, Crypto, Effect, Layer, ManagedRuntime, Path } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"

import { stubEditorOpenLayer, stubGitPlaneLayer, stubGitRuntimeLayer } from "./fixtures.ts"
import { testServerConfigLayer } from "./fixtures.ts"

const testCrypto = Crypto.make({
  randomBytes: (size) => new Uint8Array(size),
  digest: (_algorithm, data) => Effect.succeed(data),
})

const mcpProjectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const mcpThreadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const mcpTurnId = TurnId.make("30000000-0000-4000-8000-000000000001")
const testMcpSessionRegistryLayer = Layer.succeed(McpSessionRegistry)({
  issue: () =>
    Effect.succeed({
      config: {
        endpoint: "http://127.0.0.1:0/mcp",
        authorizationHeader: "Bearer test-mcp-token",
      },
    }),
  resolve: (token) =>
    Effect.succeed(
      token === "test-mcp-token"
        ? {
            environmentId: EnvironmentId.make("90000000-0000-4000-8000-000000000001"),
            projectId: mcpProjectId,
            threadId: mcpThreadId,
            turnId: mcpTurnId,
            actorId: ActorId.make(`agent:thread:${mcpThreadId}`),
            capabilities: new Set(["board:read", "board:write", "thread:ask"] as const),
            issuedAt: 1,
          }
        : undefined,
    ),
  activateTurn: () => Effect.void,
  deactivateTurn: () => Effect.void,
  touchSession: () => Effect.succeed(true),
  revokeSession: () => Effect.void,
  revokeAll: Effect.void,
})

const infrastructure = controlPlaneLayer.pipe(
  Layer.provideMerge(unavailableAgentSkillInstallerLayer),
  Layer.provideMerge(memoryLayer),
  Layer.provideMerge(testServerConfigLayer()),
  Layer.provideMerge(testMcpSessionRegistryLayer),
  Layer.provideMerge(unavailableProviderLayer),
  Layer.provideMerge(threadLiveLayer),
  Layer.provideMerge(turnUserInputRegistryLayer),
  Layer.provideMerge(unavailableTextGenerationLayer),
  Layer.provideMerge(noopDiscordPresenceLayer),
  Layer.provideMerge(stubGitRuntimeLayer),
  Layer.provideMerge(stubGitPlaneLayer),
  Layer.provideMerge(stubEditorOpenLayer),
  Layer.provideMerge(
    Layer.succeed(WorkspaceRootAccess)({
      isAvailable: () => Effect.succeed(true),
    }),
  ),
  Layer.provideMerge(NodeFileSystem.layer),
  Layer.provideMerge(Path.layer),
  Layer.provide(Layer.succeed(Crypto.Crypto)(testCrypto)),
)

describe("server routes", () => {
  it.effect("exposes readiness only after the control plane and protects the RPC upgrade", () =>
    Effect.gen(function* () {
      const runtime = ManagedRuntime.make(infrastructure)
      yield* Effect.addFinalizer(() => Effect.promise(() => runtime.dispose()))
      const context = yield* Effect.promise(() => runtime.context())
      const routes = serverRoutesLayer.pipe(
        Layer.provide(HttpServer.layerServices),
        Layer.provide(Layer.succeedContext(context)),
      )
      const { dispose, handler } = HttpRouter.toWebHandler(routes, { disableLogger: true })
      yield* Effect.addFinalizer(() => Effect.promise(() => dispose()))
      const request = (url: string, init?: RequestInit) =>
        Effect.promise(() => handler(new Request(url, init), context))
      const mcpSessions = Context.get(context, McpSessionRegistry)
      const mcpCredential = yield* mcpSessions.issue({
        projectId: mcpProjectId,
        threadId: mcpThreadId,
      })
      yield* mcpSessions.activateTurn(mcpThreadId, mcpTurnId)
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
        mcpMissing,
      ] = yield* Effect.all(
        [
          request("http://localhost/health/live"),
          request("http://localhost/health/ready"),
          request("http://localhost/rpc"),
          request("http://localhost/rpc", {
            headers: { authorization: "Bearer wrong-token" },
          }),
          request("http://localhost/api/v1/projects/legacy/tasks"),
          request("http://localhost/internal/config"),
          request("http://localhost/internal/config", {
            headers: { authorization: "Bearer wrong-token" },
          }),
          request("http://localhost/internal/config", {
            headers: { authorization: "Bearer test-launch-token" },
          }),
          request("http://localhost/internal/status"),
          request("http://localhost/internal/status", {
            headers: { authorization: "Bearer wrong-token" },
          }),
          request("http://localhost/internal/status", {
            headers: { authorization: "Bearer test-launch-token" },
          }),
          request("http://localhost/mcp", { method: "POST" }),
        ],
        { concurrency: "unbounded" },
      )
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
      assert.strictEqual(mcpMissing.status, 401)
      const mcpInitialize = yield* request("http://localhost/mcp", {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          authorization: mcpCredential.config.authorizationHeader,
          "content-type": "application/json",
        },
        body: `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"noyau-test","version":"1.0.0"}}}`,
      })
      assert.strictEqual(mcpInitialize.status, 200)
      assert.isNotNull(mcpInitialize.headers.get("mcp-session-id"))
      assert.deepStrictEqual(yield* Effect.promise(() => internalStatus.json()), {
        runningTurn: false,
      })
    }),
  )
})
