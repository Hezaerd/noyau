import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, layer } from "@effect/vitest"
import { BoardSnapshot } from "@noyau/contracts/board"
import { ActorId, EnvironmentId, ProjectId, Sequence, ThreadId, TurnId } from "@noyau/contracts/ids"
import { ControlPlane } from "@noyau/server/control-plane"
import { McpInvocationContext } from "@noyau/server/mcp/mcp-invocation-context"
import {
  NoyauMcpToolkit,
  NoyauMcpToolkitHandlersLive,
  TicketListResult,
  TicketMutationResult,
} from "@noyau/server/mcp/tools"
import { turnUserInputRegistryLayer } from "@noyau/server/provider/turn-user-input-registry"
import { Crypto, Effect, Layer, Schema, Stream } from "effect"
import { McpSchema, McpServer } from "effect/unstable/ai"

const testCrypto = () => {
  let counter = 0
  return Crypto.make({
    randomBytes: (size) => {
      const bytes = new Uint8Array(size)
      counter += 1
      bytes[size - 1] = counter % 256
      bytes[size - 2] = (counter >> 8) % 256
      return bytes
    },
    digest: (_algorithm, data) => Effect.succeed(data),
  })
}

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const turnId = TurnId.make("30000000-0000-4000-8000-000000000001")
const blockedTicketId = "70000000-0000-4000-8000-000000000001"
const prerequisiteTicketId = "70000000-0000-4000-8000-000000000002"
const actionableTicketId = "70000000-0000-4000-8000-000000000003"
const doneTicketId = "70000000-0000-4000-8000-000000000004"
const backlogColumnId = "60000000-0000-4000-8000-000000000001"
const activeColumnId = "60000000-0000-4000-8000-000000000003"
const operationId = "80000000-0000-4000-8000-000000000001"

const snapshot = Schema.decodeSync(BoardSnapshot)({
  snapshotSequence: 12,
  projectId,
  project: {
    id: projectId,
    name: "Noyau",
    workspaceRoot: "/tmp/noyau",
    defaultModelSelection: null,
    available: true,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
  },
  columns: [
    {
      id: backlogColumnId,
      projectId,
      name: "Backlog",
      color: "#64748B",
      rank: "a0",
      done: false,
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    },
    {
      id: activeColumnId,
      projectId,
      name: "En cours",
      color: "#3B82F6",
      rank: "a0V",
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
      columnId: backlogColumnId,
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
      columnId: backlogColumnId,
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
      columnId: backlogColumnId,
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

const dispatched: Array<{ readonly tag: string; readonly actorId: string }> = []

const controlPlane = ControlPlane.of({
  dispatch: (request, actorId) => {
    dispatched.push({ tag: request._tag, actorId })
    return Effect.succeed({ sequence: Sequence.make(42) })
  },
  subscribeShell: () => Stream.die("unused"),
  subscribeProject: () => Stream.make({ kind: "snapshot" as const, snapshot }),
  subscribeThread: () => Stream.die("unused"),
  getConfig: Effect.die("unused"),
  hasRunningTurn: Effect.die("unused"),
  setShellFocus: () => Effect.die("unused"),
  previewFile: () => Effect.die("unused"),
  searchWorkspacePaths: () => Effect.die("unused"),
  previewAttachment: () => Effect.die("unused"),
  getTurnDiff: () => Effect.die("unused"),
  inspectProjectAgentIntegration: () => Effect.die("unused"),
  installProjectAgentIntegration: () => Effect.die("unused"),
  removeProjectAgentIntegration: () => Effect.die("unused"),
  probe: Effect.die("unused"),
  drainReactors: Effect.die("unused"),
})

const invocation = {
  environmentId: EnvironmentId.make("90000000-0000-4000-8000-000000000001"),
  projectId,
  threadId,
  turnId,
  actorId: Schema.decodeSync(ActorId)(`agent:thread:${threadId}`),
  capabilities: new Set(["board:read", "board:write", "thread:ask"] as const),
  issuedAt: 1,
}

const client = McpSchema.McpServerClient.of({
  clientId: 1,
  protocolVersion: "2025-06-18",
  clientCapabilities: {},
  clientInfo: { name: "noyau-test", version: "1.0.0" },
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
  turnUserInputRegistryLayer,
  Layer.succeed(Crypto.Crypto)(testCrypto()),
  NodeServices.layer,
)

layer(TestLayer)("Noyau MCP tools", (it) => {
  it.effect("lists actionable and blocked Tickets with columns and MCP annotations", () =>
    Effect.gen(function* () {
      const server = yield* McpServer.McpServer
      const registered = server.tools.find(({ tool }) => tool.name === "noyau_ticket_list")
      assert.strictEqual(registered?.tool.annotations?.readOnlyHint, true)
      assert.strictEqual(registered?.tool.annotations?.destructiveHint, false)
      assert.strictEqual(registered?.tool.annotations?.idempotentHint, true)
      assert.strictEqual(registered?.tool.annotations?.openWorldHint, false)

      const toolNames = server.tools.map(({ tool }) => tool.name).toSorted()
      assert.deepEqual(toolNames, [
        "noyau_ask_question",
        "noyau_ticket_archive",
        "noyau_ticket_complete",
        "noyau_ticket_create",
        "noyau_ticket_dependency_add",
        "noyau_ticket_dependency_remove",
        "noyau_ticket_get",
        "noyau_ticket_list",
        "noyau_ticket_move",
        "noyau_ticket_reopen",
        "noyau_ticket_restore",
        "noyau_ticket_thread_link",
        "noyau_ticket_thread_unlink",
        "noyau_ticket_update",
      ])

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
      assert.deepEqual(
        actionableContent.columns.map((column) => column.name),
        ["Backlog", "En cours", "Done"],
      )
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

  it.effect("moves and links tickets through the control plane with the thread actor", () =>
    Effect.gen(function* () {
      dispatched.length = 0
      const server = yield* McpServer.McpServer

      const moved = yield* server.callTool({
        name: "noyau_ticket_move",
        arguments: {
          ticketId: actionableTicketId,
          columnId: activeColumnId,
          operationId,
        },
      })
      assert.strictEqual(moved.isError, false)
      const movedContent = yield* Schema.decodeUnknownEffect(TicketMutationResult)(
        moved.structuredContent,
      ).pipe(Effect.orDie)
      assert.strictEqual(movedContent.sequence, 42)
      assert.strictEqual(movedContent.ticketId, actionableTicketId)

      const linked = yield* server.callTool({
        name: "noyau_ticket_thread_link",
        arguments: { ticketId: prerequisiteTicketId },
      })
      assert.strictEqual(linked.isError, false)

      assert.deepEqual(
        dispatched.map((item) => item.tag),
        ["ticket.move", "ticket.thread.link"],
      )
      assert.strictEqual(dispatched[0]?.actorId, `agent:thread:${threadId}`)
      assert.strictEqual(dispatched[1]?.actorId, `agent:thread:${threadId}`)
    }),
  )
})
