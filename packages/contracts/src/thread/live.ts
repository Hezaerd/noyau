import { ThreadId, TurnId } from "@noyau/contracts/ids"
import { Schema } from "effect"

/** Hint volatile de subscribeThread : texte assistant peint, hors journal. */
export const ThreadAssistantLive = Schema.Struct({
  threadId: ThreadId,
  turnId: TurnId,
  text: Schema.String,
})
export type ThreadAssistantLive = (typeof ThreadAssistantLive)["Type"]
