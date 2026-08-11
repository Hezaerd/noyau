import { ChannelId, ProjectId } from "@noyau/protocol/ids"
import { Schema } from "effect"

export class Channel extends Schema.Class<Channel>("@noyau/protocol/entities/Channel")({
  id: ChannelId,
  projectId: ProjectId,
  name: Schema.NonEmptyString,
  createdAt: Schema.DateTimeUtcFromString,
}) {}
