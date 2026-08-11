import { ProjectId, RepositoryId } from "@noyau/protocol/ids"
import { Schema } from "effect"

export class Repository extends Schema.Class<Repository>("@noyau/protocol/entities/Repository")({
  id: RepositoryId,
  projectId: ProjectId,
  provider: Schema.Literal("github"),
  remoteUrl: Schema.NonEmptyString,
  defaultBranch: Schema.NonEmptyString,
  createdAt: Schema.DateTimeUtcFromString,
}) {}
