import { ProjectId } from "@noyau/protocol/ids"
import { WorkspaceRoot } from "@noyau/protocol/entities/environment"
import { Schema } from "effect"

export class ProjectAlreadyExists extends Schema.TaggedError<ProjectAlreadyExists>()(
  "ProjectAlreadyExists",
  { projectId: ProjectId },
) {}

export class ProjectNotFound extends Schema.TaggedError<ProjectNotFound>()("ProjectNotFound", {
  projectId: ProjectId,
}) {}

export class WorkspaceRootConflict extends Schema.TaggedError<WorkspaceRootConflict>()(
  "WorkspaceRootConflict",
  {
    workspaceRoot: WorkspaceRoot,
    projectId: ProjectId,
  },
) {}

export class ProjectUnavailable extends Schema.TaggedError<ProjectUnavailable>()(
  "ProjectUnavailable",
  { projectId: ProjectId },
) {}

export const ProjectRejection = Schema.Union([
  ProjectAlreadyExists,
  ProjectNotFound,
  WorkspaceRootConflict,
  ProjectUnavailable,
])
export type ProjectRejection = (typeof ProjectRejection)["Type"]
