import { Schema } from "effect"

/**
 * Provider-instance contracts.
 *
 * Splits the historical closed provider list into two:
 *
 * - `ProviderDriverKind` names the adapter implementation (`cursor`, `claude`,
 *   `codex`, later a fork's `grok`). It picks the probe, protocol, and catalog.
 *
 * - `ProviderInstanceId` is the routing key. Threads, sessions, model
 *   defaults, and the Environment map reference instance ids — never driver
 *   kinds — so a later cut can host two Codex slots without rewriting the
 *   journal. The built-in default ids are the historical literals
 *   (`cursor`, `claude`, `codex`).
 *
 * Driver kinds are an open branded slug. Parsing must succeed for an unknown
 * driver; the runtime marks that instance unavailable instead of failing
 * schema decode. Driver-specific config is opaque at this layer.
 *
 * @module provider-instance
 */

const PROVIDER_SLUG_MAX_CHARS = 64
const PROVIDER_SLUG_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/

const slugSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(PROVIDER_SLUG_MAX_CHARS),
  Schema.isPattern(PROVIDER_SLUG_PATTERN),
)

/** Open branded slug naming a driver implementation. */
export const ProviderDriverKind = slugSchema.pipe(Schema.brand("ProviderDriverKind"))
export type ProviderDriverKind = (typeof ProviderDriverKind)["Type"]

const isProviderDriverKindValue = Schema.is(ProviderDriverKind)
export const isProviderDriverKind = (value: unknown): value is ProviderDriverKind =>
  isProviderDriverKindValue(value)

/** User-defined routing key for a configured provider instance. */
export const ProviderInstanceId = slugSchema.pipe(Schema.brand("ProviderInstanceId"))
export type ProviderInstanceId = (typeof ProviderInstanceId)["Type"]

const isProviderInstanceIdValue = Schema.is(ProviderInstanceId)
export const isProviderInstanceId = (value: unknown): value is ProviderInstanceId =>
  isProviderInstanceIdValue(value)

/**
 * Thread and project bindings still say `provider`. That field is an instance
 * id. Historical `"cursor" | "claude" | "codex"` values keep decoding.
 */
export const Provider = ProviderInstanceId
export type Provider = ProviderInstanceId

export const DEFAULT_PROVIDER_INSTANCE_ID = ProviderInstanceId.make("cursor")

export const BUILTIN_PROVIDER_DRIVERS = ["cursor", "claude", "codex"] as const
export type BuiltinProviderDriver = (typeof BUILTIN_PROVIDER_DRIVERS)[number]

export const isBuiltinProviderDriver = (driver: string): driver is BuiltinProviderDriver =>
  (BUILTIN_PROVIDER_DRIVERS as ReadonlyArray<string>).includes(driver)

export const defaultInstanceIdForDriver = (driver: ProviderDriverKind): ProviderInstanceId =>
  ProviderInstanceId.make(driver)

export const ProviderInstanceConfig = Schema.Struct({
  driver: ProviderDriverKind,
  displayName: Schema.optionalKey(Schema.NonEmptyString),
  enabled: Schema.optionalKey(Schema.Boolean),
  config: Schema.optionalKey(Schema.Unknown),
})
export type ProviderInstanceConfig = (typeof ProviderInstanceConfig)["Type"]

export const ProviderInstanceConfigMap = Schema.Record(ProviderInstanceId, ProviderInstanceConfig)
export type ProviderInstanceConfigMap = (typeof ProviderInstanceConfigMap)["Type"]

export const instanceConfigBinaryPath = (config: unknown): string | undefined => {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    return undefined
  }
  const binaryPath = (config as { readonly binaryPath?: unknown }).binaryPath
  return typeof binaryPath === "string" && binaryPath.trim().length > 0
    ? binaryPath.trim()
    : undefined
}

export const defaultEnabledForDriver = (driver: ProviderDriverKind): boolean =>
  isBuiltinProviderDriver(driver)

/**
 * Explicit false wins. Otherwise envelope, then the driver's default
 * (built-ins on, anything else off).
 */
export const resolveProviderInstanceEnabled = (
  instance: Pick<ProviderInstanceConfig, "driver" | "enabled">,
): boolean => {
  if (instance.enabled === false) {
    return false
  }
  return instance.enabled ?? defaultEnabledForDriver(instance.driver)
}
