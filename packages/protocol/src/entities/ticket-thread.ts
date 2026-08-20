import { ThreadId, TicketId } from "@noyau/protocol/ids"
import { Schema } from "effect"

/** Lien optionnel plusieurs-à-plusieurs, identifié par la paire unique. */
export const TicketThread = Schema.Struct({
  ticketId: TicketId,
  threadId: ThreadId,
})
export type TicketThread = (typeof TicketThread)["Type"]
