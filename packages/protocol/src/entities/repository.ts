import { Schema } from "effect"

import { ProjectId, RepositoryId } from "../ids"

export class Repository extends Schema.Class<Repository>("@noyau/protocol/entities/Repository")({
  id: RepositoryId,
  projectId: ProjectId,
  provider: Schema.Literal("github"),
  remoteUrl: Schema.NonEmptyString,
  defaultBranch: Schema.NonEmptyString,
  createdAt: Schema.DateTimeUtcFromString,
}) {}
