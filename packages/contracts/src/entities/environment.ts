import { EnvironmentId } from "@noyau/contracts/ids"
import { Schema } from "effect"

import { ProviderDriverKind, ProviderInstanceId } from "./provider-instance.ts"

export {
  BUILTIN_PROVIDER_DRIVERS,
  DEFAULT_PROVIDER_INSTANCE_ID,
  Provider,
  ProviderDriverKind,
  ProviderInstanceConfig,
  ProviderInstanceConfigMap,
  ProviderInstanceId,
  defaultEnabledForDriver,
  defaultInstanceIdForDriver,
  instanceConfigBinaryPath,
  isBuiltinProviderDriver,
  isProviderDriverKind,
  isProviderInstanceId,
  resolveProviderInstanceEnabled,
} from "./provider-instance.ts"
export type {
  BuiltinProviderDriver,
  ProviderDriverKind as ProviderDriverKindType,
  ProviderInstanceId as ProviderInstanceIdType,
} from "./provider-instance.ts"

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

/** Probe slice shared by every instance. Enablement and identity live on the view. */
export const ProviderProbeStatus = Schema.Struct({
  installed: Schema.Boolean,
  handshakeOk: Schema.Boolean,
  version: Schema.NullOr(Schema.NonEmptyString),
  plan: Schema.NullOr(Schema.NonEmptyString),
  binaryPath: Schema.NullOr(Schema.NonEmptyString),
  models: Schema.optionalKey(Schema.Array(CursorModel)),
})
export type ProviderProbeStatus = (typeof ProviderProbeStatus)["Type"]

export const emptyProviderProbeStatus: ProviderProbeStatus = {
  installed: false,
  handshakeOk: false,
  version: null,
  plan: null,
  binaryPath: null,
  models: [],
}

/** @deprecated Use ProviderProbeStatus. Kept so adapter tests keep compiling during the cut. */
export const CursorProviderStatus = ProviderProbeStatus
export type CursorProviderStatus = ProviderProbeStatus
export const emptyCursorProviderStatus = emptyProviderProbeStatus

export const ClaudeProviderStatus = ProviderProbeStatus
export type ClaudeProviderStatus = ProviderProbeStatus
export const emptyClaudeProviderStatus = emptyProviderProbeStatus

export const CodexProviderStatus = ProviderProbeStatus
export type CodexProviderStatus = ProviderProbeStatus
export const emptyCodexProviderStatus = emptyProviderProbeStatus

export const ProviderInstanceView = Schema.Struct({
  instanceId: ProviderInstanceId,
  driver: ProviderDriverKind,
  enabled: Schema.Boolean,
  installed: Schema.Boolean,
  handshakeOk: Schema.Boolean,
  version: Schema.NullOr(Schema.NonEmptyString),
  plan: Schema.NullOr(Schema.NonEmptyString),
  binaryPath: Schema.NullOr(Schema.NonEmptyString),
  models: Schema.optionalKey(Schema.Array(CursorModel)),
})
export type ProviderInstanceView = (typeof ProviderInstanceView)["Type"]

export const ProviderInstanceViewMap = Schema.Record(ProviderInstanceId, ProviderInstanceView)
export type ProviderInstanceViewMap = (typeof ProviderInstanceViewMap)["Type"]

export const providerInstanceView = (input: {
  readonly instanceId: ProviderInstanceId
  readonly driver: ProviderDriverKind
  readonly enabled: boolean
  readonly probe?: ProviderProbeStatus
}): ProviderInstanceView => {
  const probe = input.probe ?? emptyProviderProbeStatus
  return {
    instanceId: input.instanceId,
    driver: input.driver,
    enabled: input.enabled,
    installed: input.enabled ? probe.installed : false,
    handshakeOk: input.enabled ? probe.handshakeOk : false,
    version: input.enabled ? probe.version : null,
    plan: input.enabled ? probe.plan : null,
    binaryPath: input.enabled ? probe.binaryPath : probe.binaryPath,
    ...(probe.models === undefined ? {} : { models: input.enabled ? probe.models : [] }),
  }
}

export const emptyProviderInstanceView = (
  instanceId: ProviderInstanceId,
  driver: ProviderDriverKind,
  enabled = true,
): ProviderInstanceView =>
  providerInstanceView({ instanceId, driver, enabled, probe: emptyProviderProbeStatus })

export const emptyEnvironmentProviders = (): ProviderInstanceViewMap => ({
  [ProviderInstanceId.make("cursor")]: emptyProviderInstanceView(
    ProviderInstanceId.make("cursor"),
    ProviderDriverKind.make("cursor"),
  ),
  [ProviderInstanceId.make("claude")]: emptyProviderInstanceView(
    ProviderInstanceId.make("claude"),
    ProviderDriverKind.make("claude"),
  ),
  [ProviderInstanceId.make("codex")]: emptyProviderInstanceView(
    ProviderInstanceId.make("codex"),
    ProviderDriverKind.make("codex"),
  ),
})

/** Racine locale durable à identité stable, non administrable depuis l'UI. */
export class Environment extends Schema.Class<Environment>("@noyau/contracts/entities/Environment")(
  {
    id: EnvironmentId,
    providers: ProviderInstanceViewMap,
    createdAt: Schema.DateTimeUtcFromString,
  },
) {}
