import { Effect, Schema } from "effect"

import {
  defaultEnabledForDriver,
  isBuiltinProviderDriver,
  ProviderDriverKind,
  ProviderInstanceConfigMap,
  ProviderInstanceId,
  resolveProviderInstanceEnabled,
  type BuiltinProviderDriver,
} from "./entities/provider-instance.ts"

export const DEFAULT_PROVIDER_INSTANCE_IDS = {
  cursor: ProviderInstanceId.make("cursor"),
  claude: ProviderInstanceId.make("claude"),
  codex: ProviderInstanceId.make("codex"),
} as const satisfies Record<BuiltinProviderDriver, ProviderInstanceId>

export const DEFAULT_PROVIDER_DRIVERS = {
  cursor: ProviderDriverKind.make("cursor"),
  claude: ProviderDriverKind.make("claude"),
  codex: ProviderDriverKind.make("codex"),
} as const satisfies Record<BuiltinProviderDriver, ProviderDriverKind>

export const defaultProviderInstanceConfigs = (): ProviderInstanceConfigMap => ({
  [DEFAULT_PROVIDER_INSTANCE_IDS.cursor]: { driver: DEFAULT_PROVIDER_DRIVERS.cursor },
  [DEFAULT_PROVIDER_INSTANCE_IDS.claude]: { driver: DEFAULT_PROVIDER_DRIVERS.claude },
  [DEFAULT_PROVIDER_INSTANCE_IDS.codex]: { driver: DEFAULT_PROVIDER_DRIVERS.codex },
})

export const ServerSettings = Schema.Struct({
  providerInstances: ProviderInstanceConfigMap.pipe(Schema.withDecodingDefault(Effect.succeed({}))),
})
export type ServerSettings = (typeof ServerSettings)["Type"]

export const DEFAULT_SERVER_SETTINGS: ServerSettings = Schema.decodeSync(ServerSettings)({})

export const ProviderInstanceConfigPatch = Schema.Struct({
  driver: Schema.optionalKey(ProviderDriverKind),
  displayName: Schema.optionalKey(Schema.NonEmptyString),
  enabled: Schema.optionalKey(Schema.Boolean),
  config: Schema.optionalKey(Schema.Unknown),
})
export type ProviderInstanceConfigPatch = (typeof ProviderInstanceConfigPatch)["Type"]

export const ServerSettingsPatch = Schema.Struct({
  providerInstances: Schema.optionalKey(
    Schema.Record(ProviderInstanceId, ProviderInstanceConfigPatch),
  ),
})
export type ServerSettingsPatch = (typeof ServerSettingsPatch)["Type"]

export const ServerSettingsOperation = Schema.Literals(["read-file", "write-file", "decode"])
export type ServerSettingsOperation = (typeof ServerSettingsOperation)["Type"]

export class ServerSettingsError extends Schema.TaggedError<ServerSettingsError>()(
  "ServerSettingsError",
  {
    settingsPath: Schema.String,
    operation: ServerSettingsOperation,
    cause: Schema.Defect(),
  },
) {}

/**
 * Overlay file instances on the three built-in defaults. File wins per id;
 * unknown extra instances are kept so a later driver can pick them up.
 */
export const hydrateProviderInstanceConfigs = (
  settings: ServerSettings,
): ProviderInstanceConfigMap => ({
  ...defaultProviderInstanceConfigs(),
  ...settings.providerInstances,
})

const mergeConfigBlob = (current: unknown, patch: unknown): unknown => {
  if (patch === undefined) {
    return current
  }
  if (
    current !== null &&
    typeof current === "object" &&
    !Array.isArray(current) &&
    patch !== null &&
    typeof patch === "object" &&
    !Array.isArray(patch)
  ) {
    return { ...current, ...patch }
  }
  return patch
}

export const mergeServerSettings = (
  current: ServerSettings,
  patch: ServerSettingsPatch,
): ServerSettings => {
  if (patch.providerInstances === undefined) {
    return current
  }
  const defaults = defaultProviderInstanceConfigs()
  const next: Record<string, (typeof current.providerInstances)[ProviderInstanceId]> = {
    ...defaults,
    ...current.providerInstances,
  }
  for (const [instanceId, instancePatch] of Object.entries(patch.providerInstances)) {
    const existing = next[instanceId] ?? defaults[instanceId as ProviderInstanceId]
    const driver = instancePatch.driver ?? existing?.driver
    if (driver === undefined) {
      continue
    }
    const displayName = instancePatch.displayName ?? existing?.displayName
    const enabled = instancePatch.enabled ?? existing?.enabled
    const config =
      instancePatch.config === undefined && existing?.config === undefined
        ? undefined
        : mergeConfigBlob(existing?.config, instancePatch.config)
    next[instanceId] = {
      driver,
      ...(displayName === undefined ? {} : { displayName }),
      ...(enabled === undefined ? {} : { enabled }),
      ...(config === undefined ? {} : { config }),
    }
  }
  return { providerInstances: next as ProviderInstanceConfigMap }
}

export const resolveHydratedInstanceEnabled = (
  instanceId: ProviderInstanceId,
  instances: ProviderInstanceConfigMap,
): boolean => {
  const instance = instances[instanceId]
  if (instance === undefined) {
    return isBuiltinProviderDriver(instanceId)
  }
  return resolveProviderInstanceEnabled(instance)
}

export { defaultEnabledForDriver, resolveProviderInstanceEnabled }
