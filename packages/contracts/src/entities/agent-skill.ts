import { Schema } from "effect"

export const AgentSkillScope = Schema.Literals(["user", "repo", "system", "admin"])
export type AgentSkillScope = (typeof AgentSkillScope)["Type"]

export const AgentSkillEntry = Schema.Struct({
  name: Schema.NonEmptyString,
  displayName: Schema.NonEmptyString,
  description: Schema.optionalKey(Schema.NonEmptyString),
  scope: AgentSkillScope,
})
export type AgentSkillEntry = (typeof AgentSkillEntry)["Type"]

export const AgentSkillCatalog = Schema.Struct({
  entries: Schema.Array(AgentSkillEntry),
})
export type AgentSkillCatalog = (typeof AgentSkillCatalog)["Type"]
