import { ChannelId, ThreadId } from "@noyau/protocol/ids"
import { Schema } from "effect"

export class Thread extends Schema.Class<Thread>("@noyau/protocol/entities/Thread")({
  id: ThreadId,
  channelId: ChannelId,
  title: Schema.NonEmptyString,
  createdAt: Schema.DateTimeUtcFromString,
}) {}
