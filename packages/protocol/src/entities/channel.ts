import { Schema } from "effect"

import { ChannelId, ProjectId } from "../ids"

export class Channel extends Schema.Class<Channel>("@noyau/protocol/entities/Channel")({
  id: ChannelId,
  projectId: ProjectId,
  name: Schema.NonEmptyString,
  createdAt: Schema.DateTimeUtcFromString,
}) {}
