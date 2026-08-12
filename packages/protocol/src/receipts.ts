import { Schema } from "effect"

import { CommandId, EventId } from "./ids"
import {
  InvalidTaskTransition,
  TaskAlreadyAssigned,
  TaskAlreadyExists,
  TaskNotFound,
} from "./task/errors"

/** Rejet métier durable d'une commande task. */
export const TaskRejection = Schema.Union([
  TaskAlreadyExists,
  TaskNotFound,
  InvalidTaskTransition,
  TaskAlreadyAssigned,
])
export type TaskRejection = (typeof TaskRejection)["Type"]

export const ReceiptResponse = Schema.Union([
  Schema.TaggedStruct("accepted", {
    eventIds: Schema.Array(EventId),
  }),
  Schema.TaggedStruct("rejected", {
    error: TaskRejection,
  }),
])
export type ReceiptResponse = (typeof ReceiptResponse)["Type"]

/** Preuve d'idempotence rendue à l'identique pour chaque retry valide. */
export const Receipt = Schema.Struct({
  commandId: CommandId,
  response: ReceiptResponse,
})
export type Receipt = (typeof Receipt)["Type"]
