import { EnvironmentId } from "@noyau/protocol/ids"
import { Schema } from "effect"

/** Chemin absolu du dossier où Noyau et Cursor travaillent. */
export const WorkspaceRoot = Schema.NonEmptyString.check(
  Schema.makeFilter(
    (value) =>
      value.startsWith("/") ||
      /^[A-Za-z]:[\\/]/.test(value) ||
      /^(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+/.test(value),
    {
      identifier: "WorkspaceRoot",
      expected: "an absolute POSIX, Windows drive, or UNC directory path",
    },
  ),
).pipe(Schema.brand("WorkspaceRoot"))
export type WorkspaceRoot = (typeof WorkspaceRoot)["Type"]

/** Unique provider réel de la v0.1. */
export const Provider = Schema.Literal("cursor")
export type Provider = (typeof Provider)["Type"]

export const CursorReasoningEffort = Schema.Struct({
  value: Schema.NonEmptyString,
  label: Schema.NonEmptyString,
})
export type CursorReasoningEffort = (typeof CursorReasoningEffort)["Type"]

export const CursorModel = Schema.Struct({
  modelId: Schema.NonEmptyString,
  label: Schema.NonEmptyString,
  reasoningEfforts: Schema.Array(CursorReasoningEffort),
})
export type CursorModel = (typeof CursorModel)["Type"]

export const CursorProviderStatus = Schema.Struct({
  installed: Schema.Boolean,
  handshakeOk: Schema.Boolean,
  version: Schema.NullOr(Schema.NonEmptyString),
  plan: Schema.NullOr(Schema.NonEmptyString),
  binaryPath: Schema.NullOr(Schema.NonEmptyString),
  models: Schema.optionalKey(Schema.Array(CursorModel)),
})
export type CursorProviderStatus = (typeof CursorProviderStatus)["Type"]

export const emptyCursorProviderStatus: CursorProviderStatus = {
  installed: false,
  handshakeOk: false,
  version: null,
  plan: null,
  binaryPath: null,
  models: [],
}

/** Racine locale durable à identité stable, non administrable depuis l'UI. */
export class Environment extends Schema.Class<Environment>("@noyau/protocol/entities/Environment")({
  id: EnvironmentId,
  cursor: CursorProviderStatus,
  createdAt: Schema.DateTimeUtcFromString,
}) {}
