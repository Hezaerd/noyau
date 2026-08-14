import {
  AgentProfileId,
  AgentRunId,
  ArtifactId,
  AttemptId,
  ExecutionId,
  ProjectId,
  TicketId,
} from "@noyau/protocol/ids"
import { Schema } from "effect"

export const AttemptStatus = Schema.Literals([
  "pending",
  "leased",
  "running",
  "waiting_human",
  "waiting_agent",
  "verifying",
  "completed",
  "failed",
  "cancelled",
])
export type AttemptStatus = (typeof AttemptStatus)["Type"]

export const TokenBudget = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
export type TokenBudget = (typeof TokenBudget)["Type"]

export const DurationBudgetSeconds = Schema.Int.check(Schema.isGreaterThan(0))
export type DurationBudgetSeconds = (typeof DurationBudgetSeconds)["Type"]

export class ExecutionBudget extends Schema.Class<ExecutionBudget>(
  "@noyau/protocol/entities/ExecutionBudget",
)({
  maxTokens: TokenBudget,
  timeoutSeconds: DurationBudgetSeconds,
}) {}

export class ToolPolicy extends Schema.Class<ToolPolicy>("@noyau/protocol/entities/ToolPolicy")({
  allowed: Schema.Array(Schema.NonEmptyString),
}) {}

export class Execution extends Schema.Class<Execution>("@noyau/protocol/entities/Execution")({
  id: ExecutionId,
  ticketId: TicketId,
  projectId: ProjectId,
  expectedOutcome: Schema.NonEmptyString,
  agentProfileId: AgentProfileId,
  budget: ExecutionBudget,
  toolPolicy: ToolPolicy,
  createdAt: Schema.DateTimeUtcFromString,
}) {}

export class Attempt extends Schema.Class<Attempt>("@noyau/protocol/entities/Attempt")({
  id: AttemptId,
  executionId: ExecutionId,
  number: Schema.Int.check(Schema.isGreaterThan(0)),
  status: AttemptStatus,
  primaryRunId: Schema.optionalKey(AgentRunId),
  auxiliaryRunIds: Schema.Array(AgentRunId),
  artifactIds: Schema.Array(ArtifactId),
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}
