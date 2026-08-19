import { EnvironmentId } from "@noyau/protocol/ids"
import { Schema } from "effect"

/** Chemin absolu du dossier où Noyau et Cursor travaillent. */
export const WorkspaceRoot = Schema.NonEmptyString.pipe(Schema.brand("WorkspaceRoot"))
export type WorkspaceRoot = (typeof WorkspaceRoot)["Type"]

/** Unique provider réel de la v0.1. */
export const Provider = Schema.Literal("cursor")
export type Provider = (typeof Provider)["Type"]

export const CursorProviderStatus = Schema.Struct({
  installed: Schema.Boolean,
  handshakeOk: Schema.Boolean,
})
export type CursorProviderStatus = (typeof CursorProviderStatus)["Type"]

/** Racine locale durable à identité stable, non administrable depuis l'UI. */
export class Environment extends Schema.Class<Environment>("@noyau/protocol/entities/Environment")({
  id: EnvironmentId,
  cursor: CursorProviderStatus,
  createdAt: Schema.DateTimeUtcFromString,
}) {}
