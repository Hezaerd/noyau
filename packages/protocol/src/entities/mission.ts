import { MissionId, ProjectId } from "@noyau/protocol/ids"
import { Schema } from "effect"

export class Mission extends Schema.Class<Mission>("@noyau/protocol/entities/Mission")({
  id: MissionId,
  projectId: ProjectId,
  title: Schema.NonEmptyString,
  objective: Schema.optionalKey(Schema.String),
  createdAt: Schema.DateTimeUtcFromString,
}) {}
