import { WorkspaceRoot } from "@noyau/contracts/entities/environment"
import { DefaultModelSelection } from "@noyau/contracts/entities/model-selection"
import { ProjectId } from "@noyau/contracts/ids"
import { Schema } from "effect"

export class Project extends Schema.Class<Project>("@noyau/contracts/entities/Project")({
  id: ProjectId,
  name: Schema.NonEmptyString,
  workspaceRoot: WorkspaceRoot,
  defaultModelSelection: Schema.NullOr(DefaultModelSelection),
  /** `false` si le dossier est absent : le Project reste, les commandes sont refusées. */
  available: Schema.Boolean,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}
