import { Session } from "@noyau/protocol/entities/session"
import { Thread } from "@noyau/protocol/entities/thread"
import { TranscriptItem } from "@noyau/protocol/entities/transcript"
import { Turn } from "@noyau/protocol/entities/turn"
import { Sequence } from "@noyau/protocol/ids"
import { Schema } from "effect"

export const ThreadSnapshot = Schema.Struct({
  snapshotSequence: Sequence,
  thread: Thread,
  session: Schema.NullOr(Session),
  turns: Schema.Array(Turn),
  transcript: Schema.Array(TranscriptItem),
})
export type ThreadSnapshot = (typeof ThreadSnapshot)["Type"]
