import { ProjectId } from "@noyau/protocol/ids"
import { Schema } from "effect"

export class Project extends Schema.Class<Project>("@noyau/protocol/entities/Project")({
  id: ProjectId,
  name: Schema.NonEmptyString,
  description: Schema.optionalKey(Schema.String),
  createdAt: Schema.DateTimeUtcFromString,
}) {}
