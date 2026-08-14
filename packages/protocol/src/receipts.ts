import { Schema } from "effect"

import { CommandId, EventId } from "./ids"
import { TicketRejection } from "./ticket/errors"

export const TicketReceiptResponse = Schema.Union([
  Schema.TaggedStruct("accepted", {
    eventIds: Schema.Array(EventId),
  }),
  Schema.TaggedStruct("rejected", {
    error: TicketRejection,
  }),
])
export type TicketReceiptResponse = (typeof TicketReceiptResponse)["Type"]

export const TicketReceipt = Schema.Struct({
  commandId: CommandId,
  response: TicketReceiptResponse,
})
export type TicketReceipt = (typeof TicketReceipt)["Type"]
