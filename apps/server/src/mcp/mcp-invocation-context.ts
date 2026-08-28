import type { ActorId, EnvironmentId, ProjectId, ThreadId, TurnId } from "@noyau/contracts/ids"
import { Context, Effect, Schema } from "effect"

export const McpCapability = Schema.Literals(["board:read", "board:write", "thread:ask"] as const)
export type McpCapability = (typeof McpCapability)["Type"]

export interface McpInvocationScope {
  readonly environmentId: EnvironmentId
  readonly projectId: ProjectId
  readonly threadId: ThreadId
  readonly turnId: TurnId
  readonly actorId: ActorId
  readonly capabilities: ReadonlySet<McpCapability>
  readonly issuedAt: number
}

export class McpInvocationContext extends Context.Service<
  McpInvocationContext,
  McpInvocationScope
>()("@noyau/server/mcp/McpInvocationContext") {}

export class McpCapabilityMissing extends Schema.TaggedError<McpCapabilityMissing>()(
  "McpCapabilityMissing",
  { capability: McpCapability },
) {}

export const requireMcpCapability = Effect.fn("McpInvocationContext.requireCapability")(function* (
  capability: McpCapability,
) {
  const invocation = yield* McpInvocationContext
  if (!invocation.capabilities.has(capability)) {
    return yield* new McpCapabilityMissing({ capability })
  }
  return invocation
})
