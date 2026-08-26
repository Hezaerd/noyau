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

/** Provider réel d'un Thread. Immuable après `thread.create`. */
export const Provider = Schema.Literals(["cursor", "claude", "codex"])
export type Provider = (typeof Provider)["Type"]

export const CursorReasoningEffort = Schema.Struct({
  value: Schema.NonEmptyString,
  label: Schema.NonEmptyString,
  description: Schema.optionalKey(Schema.NonEmptyString),
  isDefault: Schema.optionalKey(Schema.Boolean),
})
export type CursorReasoningEffort = (typeof CursorReasoningEffort)["Type"]

export const CursorServiceTier = Schema.Struct({
  value: Schema.NonEmptyString,
  label: Schema.NonEmptyString,
  description: Schema.optionalKey(Schema.NonEmptyString),
  isDefault: Schema.optionalKey(Schema.Boolean),
})
export type CursorServiceTier = (typeof CursorServiceTier)["Type"]

export const CursorThinkingOption = Schema.Struct({
  label: Schema.NonEmptyString,
  description: Schema.optionalKey(Schema.NonEmptyString),
  defaultValue: Schema.optionalKey(Schema.Boolean),
})
export type CursorThinkingOption = (typeof CursorThinkingOption)["Type"]

export const CursorModel = Schema.Struct({
  modelId: Schema.NonEmptyString,
  label: Schema.NonEmptyString,
  reasoningEfforts: Schema.Array(CursorReasoningEffort),
  serviceTiers: Schema.Array(CursorServiceTier),
  thinking: Schema.optionalKey(CursorThinkingOption),
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

/** Statut live Claude : même forme de catalogue que Cursor. */
export const ClaudeProviderStatus = CursorProviderStatus
export type ClaudeProviderStatus = CursorProviderStatus

export const emptyClaudeProviderStatus: ClaudeProviderStatus = emptyCursorProviderStatus

/** Statut live Codex : même forme de catalogue que Cursor. */
export const CodexProviderStatus = CursorProviderStatus
export type CodexProviderStatus = CursorProviderStatus

export const emptyCodexProviderStatus: CodexProviderStatus = emptyCursorProviderStatus

/** Racine locale durable à identité stable, non administrable depuis l'UI. */
export class Environment extends Schema.Class<Environment>("@noyau/protocol/entities/Environment")({
  id: EnvironmentId,
  cursor: CursorProviderStatus,
  claude: ClaudeProviderStatus,
  codex: CodexProviderStatus,
  createdAt: Schema.DateTimeUtcFromString,
}) {}
