import { assert, layer } from "@effect/vitest"
import { BoardSnapshot } from "@noyau/protocol/board"
import { ActorId, EnvironmentId, ProjectId, ThreadId, TurnId } from "@noyau/protocol/ids"
import { ControlPlane } from "@noyau/server/control-plane"
import { McpInvocationContext } from "@noyau/server/mcp/mcp-invocation-context"
import {
  NoyauMcpToolkit,
  NoyauMcpToolkitHandlersLive,
  TicketListResult,
} from "@noyau/server/mcp/tools"
import { Effect, Layer, Schema, Stream } from "effect"
import { McpSchema, McpServer } from "effect/unstable/ai"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const turnId = TurnId.make("30000000-0000-4000-8000-000000000001")
const blockedTicketId = "70000000-0000-4000-8000-000000000001"
const prerequisiteTicketId = "70000000-0000-4000-8000-000000000002"
const actionableTicketId = "70000000-0000-4000-8000-000000000003"
const doneTicketId = "70000000-0000-4000-8000-000000000004"

const snapshot = Schema.decodeSync(BoardSnapshot)({
  snapshotSequence: 12,
  projectId,
  project: {
    id: projectId,
    name: "Noyau",
    workspaceRoot: "/tmp/noyau",
    available: true,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
  },
  columns: [
    {
      id: "60000000-0000-4000-8000-000000000001",
      projectId,
      name: "Backlog",
      color: "#64748B",
      rank: "a0",
      done: false,
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    },
    {
      id: "60000000-0000-4000-8000-000000000002",
      projectId,
      name: "Done",
      color: "#22C55E",
      rank: "a1",
      done: true,
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    },
  ],
  tickets: [
    {
      id: blockedTicketId,
      projectId,
      columnId: "60000000-0000-4000-8000-000000000001",
      rank: "a0",
      title: "Blocked work",
      priority: "high",
      done: false,
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    },
    {
      id: prerequisiteTicketId,
      projectId,
      columnId: "60000000-0000-4000-8000-000000000001",
      rank: "a1",
      title: "Open prerequisite",
      priority: "normal",
      done: false,
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    },
    {
      id: actionableTicketId,
      projectId,
      columnId: "60000000-0000-4000-8000-000000000001",
      rank: "a2",
      title: "Actionable work",
      description: "Ready for an agent",
      priority: "urgent",
      dueAt: "2026-08-22T00:00:00.000Z",
      done: false,
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    },
    {
      id: doneTicketId,
      projectId,
      columnId: "60000000-0000-4000-8000-000000000002",
      rank: "a0",
      title: "Finished work",
      priority: "low",
      done: true,
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    },
  ],
  ticketDependencies: [{ ticketId: blockedTicketId, dependsOnTicketId: prerequisiteTicketId }],
  ticketThreads: [{ ticketId: actionableTicketId, threadId }],
  ticketActivity: [],
})

const controlPlane = ControlPlane.of({
  dispatch: () => Effect.die("unused"),
  subscribeShell: () => Stream.die("unused"),
  subscribeProject: () => Stream.make({ kind: "snapshot" as const, snapshot }),
  subscribeThread: () => Stream.die("unused"),
  getConfig: Effect.die("unused"),
  hasRunningTurn: Effect.die("unused"),
  probe: Effect.die("unused"),
  drainReactors: Effect.die("unused"),
})

const invocation = {
  environmentId: EnvironmentId.make("90000000-0000-4000-8000-000000000001"),
  projectId,
  threadId,
  turnId,
  actorId: Schema.decodeSync(ActorId)(`agent:cursor:${turnId}`),
  capabilities: new Set(["board:read"] as const),
  issuedAt: 1,
}

const client = McpSchema.McpServerClient.of({
  clientId: 1,
  protocolVersion: "2025-06-18",
  initializePayload: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "noyau-test", version: "1.0.0" },
  },
  getClient: Effect.die("unused"),
})

const TestLayer = Layer.mergeAll(
  McpServer.toolkit(NoyauMcpToolkit).pipe(
    Layer.provide(NoyauMcpToolkitHandlersLive),
    Layer.provideMerge(McpServer.McpServer.layer),
  ),
  Layer.succeed(ControlPlane)(controlPlane),
  Layer.succeed(McpInvocationContext)(invocation),
  Layer.succeed(McpSchema.McpServerClient)(client),
)

layer(TestLayer)("Noyau MCP tools", (it) => {
  it.effect("lists actionable and blocked Tickets with MCP annotations", () =>
    Effect.gen(function* () {
      const server = yield* McpServer.McpServer
      const registered = server.tools.find(({ tool }) => tool.name === "noyau_ticket_list")
      assert.strictEqual(registered?.tool.annotations?.readOnlyHint, true)
      assert.strictEqual(registered?.tool.annotations?.destructiveHint, false)
      assert.strictEqual(registered?.tool.annotations?.idempotentHint, true)
      assert.strictEqual(registered?.tool.annotations?.openWorldHint, false)

      const actionable = yield* server.callTool({
        name: "noyau_ticket_list",
        arguments: { state: "open", actionability: "actionable" },
      })
      assert.strictEqual(actionable.isError, false)
      const actionableContent = yield* Schema.decodeUnknownEffect(TicketListResult)(
        actionable.structuredContent,
      ).pipe(Effect.orDie)
      assert.deepEqual(
        actionableContent.tickets.map((ticket) => ticket.ticketId),
        [prerequisiteTicketId, actionableTicketId],
      )
      assert.strictEqual(actionableContent.projectId, projectId)
      assert.strictEqual(actionableContent.snapshotSequence, 12)
      assert.isTrue(actionableContent.tickets[0]?.actionable)
      assert.isFalse(actionableContent.tickets[0]?.linkedToCurrentThread)
      assert.isTrue(actionableContent.tickets[1]?.actionable)
      assert.isTrue(actionableContent.tickets[1]?.linkedToCurrentThread)

      const blocked = yield* server.callTool({
        name: "noyau_ticket_list",
        arguments: { actionability: "blocked" },
      })
      const blockedContent = yield* Schema.decodeUnknownEffect(TicketListResult)(
        blocked.structuredContent,
      ).pipe(Effect.orDie)
      assert.strictEqual(blockedContent.tickets[0]?.ticketId, blockedTicketId)
      assert.isFalse(blockedContent.tickets[0]?.actionable)
      assert.strictEqual(blockedContent.tickets[0]?.blockedBy[0]?.ticketId, prerequisiteTicketId)
      assert.strictEqual(blockedContent.tickets[0]?.blockedBy[0]?.title, "Open prerequisite")
      assert.isFalse(blockedContent.tickets[0]?.blockedBy[0]?.done)
    }),
  )
})
