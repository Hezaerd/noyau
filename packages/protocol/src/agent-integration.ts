import { Schema } from "effect"

import { ProjectId } from "./ids.ts"

export const NOYAU_AGENT_SKILL_NAME = "noyau" as const
export const NOYAU_AGENT_SKILL_VERSION = "1.0.0" as const

export const AgentIntegrationStatusKind = Schema.Literals([
  "absent",
  "current",
  "outdated",
  "conflict",
  "unavailable",
])
export type AgentIntegrationStatusKind = (typeof AgentIntegrationStatusKind)["Type"]

export const ProjectAgentIntegration = Schema.Struct({
  projectId: ProjectId,
  skillName: Schema.Literal(NOYAU_AGENT_SKILL_NAME),
  targetPath: Schema.NonEmptyString,
  currentVersion: Schema.Literal(NOYAU_AGENT_SKILL_VERSION),
  installedVersion: Schema.optionalKey(Schema.NonEmptyString),
  status: AgentIntegrationStatusKind,
})
export type ProjectAgentIntegration = (typeof ProjectAgentIntegration)["Type"]

export const ProjectAgentIntegrationInput = Schema.Struct({ projectId: ProjectId })
export type ProjectAgentIntegrationInput = (typeof ProjectAgentIntegrationInput)["Type"]

export const AgentIntegrationFailureReason = Schema.Literals([
  "conflict",
  "unavailable",
  "unsafe-path",
])
export type AgentIntegrationFailureReason = (typeof AgentIntegrationFailureReason)["Type"]

export class AgentIntegrationFailed extends Schema.TaggedError<AgentIntegrationFailed>()(
  "AgentIntegrationFailed",
  { reason: AgentIntegrationFailureReason },
) {}
