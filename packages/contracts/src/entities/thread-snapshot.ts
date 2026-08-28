import { Session } from "@noyau/contracts/entities/session"
import { Thread } from "@noyau/contracts/entities/thread"
import { TranscriptItem } from "@noyau/contracts/entities/transcript"
import { Turn } from "@noyau/contracts/entities/turn"
import { Sequence } from "@noyau/contracts/ids"
import { Schema } from "effect"

export const ThreadSnapshot = Schema.Struct({
  snapshotSequence: Sequence,
  thread: Thread,
  session: Schema.NullOr(Session),
  turns: Schema.Array(Turn),
  transcript: Schema.Array(TranscriptItem),
})
export type ThreadSnapshot = (typeof ThreadSnapshot)["Type"]
