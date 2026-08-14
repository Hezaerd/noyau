import { BoardSnapshot, EventCursor } from "@noyau/protocol/board"
import { Execution } from "@noyau/protocol/entities/execution"
import { EventEnvelope } from "@noyau/protocol/events"
import { ProjectId, TicketId } from "@noyau/protocol/ids"
import { TicketReceipt } from "@noyau/protocol/receipts"
import { TicketCommandRequest } from "@noyau/protocol/ticket/commands"
import { Schema } from "effect"
import { Rpc, RpcGroup, RpcMiddleware } from "effect/unstable/rpc"

import {
  CommandIdConflict,
  CurrentActor,
  Forbidden,
  InvalidCausation,
  InvalidEventCursor,
  MissingIdentity,
  ServiceUnavailable,
} from "./control-plane"

/**
 * Authentifie une connexion au control plane et fournit l'acteur vérifié aux
 * handlers. Le client ne choisit jamais l'identité dans le payload métier.
 */
export class NoyauRpcIdentity extends RpcMiddleware.Service<
  NoyauRpcIdentity,
  { provides: CurrentActor }
>()("@noyau/protocol/rpc/NoyauRpcIdentity", {
  error: Schema.Union([MissingIdentity, Forbidden]),
}) {}

export const ProjectEvent = Schema.Struct({
  cursor: EventCursor,
  envelope: EventEnvelope,
})
export type ProjectEvent = (typeof ProjectEvent)["Type"]

export const SubmitTicketCommand = Rpc.make("SubmitTicketCommand", {
  payload: Schema.Struct({
    projectId: ProjectId,
    request: TicketCommandRequest,
  }),
  success: TicketReceipt,
  error: Schema.Union([
    InvalidCausation,
    CommandIdConflict,
    ServiceUnavailable,
  ]),
})

export const GetBoardSnapshot = Rpc.make("GetBoardSnapshot", {
  payload: Schema.Struct({
    projectId: ProjectId,
  }),
  success: BoardSnapshot,
  error: ServiceUnavailable,
})

export const GetTicketExecutions = Rpc.make("GetTicketExecutions", {
  payload: Schema.Struct({
    projectId: ProjectId,
    ticketId: TicketId,
  }),
  success: Schema.Array(Execution),
  error: ServiceUnavailable,
})

export const SubscribeProjectEvents = Rpc.make("SubscribeProjectEvents", {
  payload: Schema.Struct({
    projectId: ProjectId,
    cursor: EventCursor,
  }),
  success: ProjectEvent,
  error: Schema.Union([InvalidEventCursor, ServiceUnavailable]),
  stream: true,
})

/** Contrat unique client/serveur du control plane sur WebSocket. */
export const ControlPlaneRpcs = RpcGroup.make(
  SubmitTicketCommand,
  GetBoardSnapshot,
  GetTicketExecutions,
  SubscribeProjectEvents,
).middleware(NoyauRpcIdentity)

export type ControlPlaneRpcs = typeof ControlPlaneRpcs
