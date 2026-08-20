import { WorkspaceRoot } from "@noyau/protocol/entities/environment"
import { ProjectId } from "@noyau/protocol/ids"
import { Schema } from "effect"

export class Project extends Schema.Class<Project>("@noyau/protocol/entities/Project")({
  id: ProjectId,
  name: Schema.NonEmptyString,
  workspaceRoot: WorkspaceRoot,
  /** `false` si le dossier est absent : le Project reste, les commandes sont refusées. */
  available: Schema.Boolean,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}
