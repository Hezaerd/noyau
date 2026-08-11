import { Schema } from "effect"

import { ProjectId } from "../ids"

export class Project extends Schema.Class<Project>("@noyau/protocol/entities/Project")({
  id: ProjectId,
  name: Schema.NonEmptyString,
  description: Schema.optionalKey(Schema.String),
  createdAt: Schema.DateTimeUtcFromString,
}) {}
