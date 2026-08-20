import { Schema } from "effect"

import { ProjectCommand, ProjectCommandRequest } from "./project/commands"
import { ClientThreadCommand, InternalThreadCommand, ThreadCommandRequest } from "./thread/commands"
import { TicketCommand, TicketCommandRequest } from "./ticket/commands"

/** Intention soumise par le renderer. L'acteur n'est pas dans le payload. */
export const ClientCommandRequest = Schema.Union([
  ProjectCommandRequest,
  TicketCommandRequest,
  ThreadCommandRequest,
])
export type ClientCommandRequest = (typeof ClientCommandRequest)["Type"]
export const decodeClientCommandRequest = Schema.decodeUnknownEffect(ClientCommandRequest)

export const InternalCommand = InternalThreadCommand
export type InternalCommand = (typeof InternalCommand)["Type"]

/** Commande enrichie par Noyau. Inclut les commandes internes d'ingestion. */
export const Command = Schema.Union([
  ProjectCommand,
  TicketCommand,
  ClientThreadCommand,
  InternalCommand,
])
export type Command = (typeof Command)["Type"]
export const decodeCommand = Schema.decodeUnknownEffect(Command)
