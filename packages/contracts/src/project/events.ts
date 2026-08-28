import { WorkspaceRoot } from "@noyau/contracts/entities/environment"
import { DefaultModelSelection } from "@noyau/contracts/entities/model-selection"
import { ProjectId } from "@noyau/contracts/ids"
import { Schema } from "effect"

export const ProjectCreated = Schema.TaggedStruct("project.created", {
  projectId: ProjectId,
  name: Schema.NonEmptyString,
  workspaceRoot: WorkspaceRoot,
  defaultModelSelection: Schema.optionalKey(Schema.NullOr(DefaultModelSelection)),
})
export type ProjectCreated = (typeof ProjectCreated)["Type"]

export const ProjectMetaUpdated = Schema.TaggedStruct("project.meta-updated", {
  projectId: ProjectId,
  name: Schema.optionalKey(Schema.NonEmptyString),
  defaultModelSelection: Schema.optionalKey(Schema.NullOr(DefaultModelSelection)),
})
export type ProjectMetaUpdated = (typeof ProjectMetaUpdated)["Type"]

export const ProjectRebound = Schema.TaggedStruct("project.rebound", {
  projectId: ProjectId,
  workspaceRoot: WorkspaceRoot,
})
export type ProjectRebound = (typeof ProjectRebound)["Type"]

export const ProjectDeleted = Schema.TaggedStruct("project.deleted", {
  projectId: ProjectId,
})
export type ProjectDeleted = (typeof ProjectDeleted)["Type"]

export const ProjectEvent = Schema.Union([
  ProjectCreated,
  ProjectMetaUpdated,
  ProjectRebound,
  ProjectDeleted,
])
export type ProjectEvent = (typeof ProjectEvent)["Type"]
