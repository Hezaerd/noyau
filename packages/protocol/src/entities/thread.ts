import { Schema } from "effect"

import { ChannelId, ThreadId } from "../ids"

export class Thread extends Schema.Class<Thread>("@noyau/protocol/entities/Thread")({
  id: ThreadId,
  channelId: ChannelId,
  title: Schema.NonEmptyString,
  createdAt: Schema.DateTimeUtcFromString,
}) {}
