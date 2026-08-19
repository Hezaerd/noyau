import { ProjectRejection } from "@noyau/protocol/project/errors"
import { TicketRejection } from "@noyau/protocol/ticket/errors"
import { ThreadRejection } from "@noyau/protocol/thread/errors"
import { Schema } from "effect"

import { CommandId, Sequence } from "./ids"

export const Rejection = Schema.Union([ProjectRejection, TicketRejection, ThreadRejection])
export type Rejection = (typeof Rejection)["Type"]

export const ReceiptResponse = Schema.Union([
  Schema.TaggedStruct("accepted", {
    sequence: Sequence,
  }),
  Schema.TaggedStruct("rejected", {
    error: Rejection,
  }),
])
export type ReceiptResponse = (typeof ReceiptResponse)["Type"]

export const Receipt = Schema.Struct({
  commandId: CommandId,
  response: ReceiptResponse,
})
export type Receipt = (typeof Receipt)["Type"]

export const DispatchResult = Schema.Struct({
  sequence: Sequence,
})
export type DispatchResult = (typeof DispatchResult)["Type"]
