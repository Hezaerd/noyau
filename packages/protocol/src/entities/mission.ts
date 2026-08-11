import { Schema } from "effect"

import { MissionId, ProjectId } from "../ids"

export class Mission extends Schema.Class<Mission>("@noyau/protocol/entities/Mission")({
  id: MissionId,
  projectId: ProjectId,
  title: Schema.NonEmptyString,
  objective: Schema.optionalKey(Schema.String),
  createdAt: Schema.DateTimeUtcFromString,
}) {}
