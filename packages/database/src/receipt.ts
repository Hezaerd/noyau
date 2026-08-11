import { InvalidTaskTransition, TaskAlreadyExists, TaskNotFound } from "@noyau/domain/task/decider"
import { CommandId, EventId } from "@noyau/protocol/ids"
import { Schema } from "effect"

/**
 * Receipt : preuve d'idempotence d'une commande. Persisté dans la même
 * transaction que les événements ; un retry de la même commande relit le
 * receipt au lieu de ré-exécuter le decider. Un rejet métier est une réponse
 * stable, pas une erreur transitoire.
 */
export const TaskRejection = Schema.Union([TaskAlreadyExists, TaskNotFound, InvalidTaskTransition])
export type TaskRejection = (typeof TaskRejection)["Type"]

export const ReceiptResponse = Schema.Union([
  Schema.TaggedStruct("accepted", { eventIds: Schema.Array(EventId) }),
  Schema.TaggedStruct("rejected", { error: TaskRejection }),
])
export type ReceiptResponse = (typeof ReceiptResponse)["Type"]

export const Receipt = Schema.Struct({
  commandId: CommandId,
  response: ReceiptResponse,
})
export type Receipt = (typeof Receipt)["Type"]
