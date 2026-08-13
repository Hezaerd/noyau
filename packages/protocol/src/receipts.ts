import { Schema } from "effect"

import { CommandId, EventId } from "./ids"
import {
  InvalidTaskTransition,
  TaskAlreadyAssigned,
  TaskAlreadyExists,
  TaskNotFound,
} from "./task/errors"
import { TicketRejection } from "./ticket/errors"

/** Rejet métier durable d'une commande task. */
export const TaskRejection = Schema.Union([
  TaskAlreadyExists,
  TaskNotFound,
  InvalidTaskTransition,
  TaskAlreadyAssigned,
])
export type TaskRejection = (typeof TaskRejection)["Type"]

export const CommandRejection = Schema.Union([TaskRejection, TicketRejection])
export type CommandRejection = (typeof CommandRejection)["Type"]

export const ReceiptResponse = Schema.Union([
  Schema.TaggedStruct("accepted", {
    eventIds: Schema.Array(EventId),
  }),
  Schema.TaggedStruct("rejected", {
    error: TaskRejection,
  }),
])
export type ReceiptResponse = (typeof ReceiptResponse)["Type"]

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

/** Preuve d'idempotence rendue à l'identique pour chaque retry valide. */
export const Receipt = Schema.Struct({
  commandId: CommandId,
  response: ReceiptResponse,
})
export type Receipt = (typeof Receipt)["Type"]
