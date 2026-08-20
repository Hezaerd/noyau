import { EnvironmentId } from "@noyau/protocol/ids"
import { ServerConfig, type ServerConfigValue } from "@noyau/server/config"
import { Layer, Redacted, Schema } from "effect"

export const testServerConfig = (
  overrides: Partial<ServerConfigValue> = {},
): ServerConfigValue => ({
  environment: "test",
  dataDirectory: "/tmp/noyau-test",
  databaseFile: ":memory:",
  host: "127.0.0.1",
  port: 0,
  bearerToken: Redacted.make("test-launch-token"),
  actorId: "human:test",
  environmentId: Schema.decodeSync(EnvironmentId)("90000000-0000-4000-8000-000000000001"),
  environmentCreatedAt: Schema.decodeSync(Schema.DateTimeUtcFromString)("2026-08-20T00:00:00.000Z"),
  bootstrapVersion: "1",
  bundleVersion: "0.1.0-test",
  serverVersion: "0.1.0-test",
  ...overrides,
})

export const testServerConfigLayer = (overrides: Partial<ServerConfigValue> = {}) =>
  Layer.succeed(ServerConfig)(testServerConfig(overrides))
