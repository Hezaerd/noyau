import { WorkspaceRoot } from "@noyau/protocol/entities/environment"
import { ProjectId } from "@noyau/protocol/ids"
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

export class WorkspaceRootUnavailable extends Schema.TaggedError<WorkspaceRootUnavailable>()(
  "WorkspaceRootUnavailable",
  { workspaceRoot: WorkspaceRoot },
) {}

export class WorkspaceRootNotFound extends Schema.TaggedError<WorkspaceRootNotFound>()(
  "WorkspaceRootNotFound",
  { workspaceRoot: WorkspaceRoot },
) {}

export class WorkspaceRootNotDirectory extends Schema.TaggedError<WorkspaceRootNotDirectory>()(
  "WorkspaceRootNotDirectory",
  { workspaceRoot: WorkspaceRoot },
) {}

export class ProjectUnavailable extends Schema.TaggedError<ProjectUnavailable>()(
  "ProjectUnavailable",
  { projectId: ProjectId },
) {}

export const ProjectRejection = Schema.Union([
  ProjectAlreadyExists,
  ProjectNotFound,
  WorkspaceRootConflict,
  WorkspaceRootUnavailable,
  WorkspaceRootNotFound,
  WorkspaceRootNotDirectory,
  ProjectUnavailable,
])
export type ProjectRejection = (typeof ProjectRejection)["Type"]
