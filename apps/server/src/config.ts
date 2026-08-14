import { Config, Context, Layer, Redacted } from "effect"

export type NoyauEnvironment = "development" | "test" | "production"

export interface ServerConfigValue {
  readonly environment: NoyauEnvironment
  readonly databaseUrl: Redacted.Redacted
  readonly host: string
  readonly port: number
  readonly eventPollInterval: number
}

export class ServerConfig extends Context.Service<ServerConfig, ServerConfigValue>()(
  "@noyau/server/ServerConfig",
) {}

const defaultDatabaseUrl = "postgresql://noyau:noyau@localhost:5432/noyau"

export const serverConfig = Config.all({
  environment: Config.literals(["development", "test", "production"] as const, "NOYAU_ENV").pipe(
    Config.withDefault("development"),
  ),
  databaseUrl: Config.redacted("DATABASE_URL").pipe(
    Config.withDefault(Redacted.make(defaultDatabaseUrl)),
  ),
  host: Config.string("HOST").pipe(Config.withDefault("127.0.0.1")),
  port: Config.port("PORT").pipe(Config.withDefault(3001)),
  eventPollInterval: Config.int("EVENT_POLL_INTERVAL_MS").pipe(Config.withDefault(500)),
})

export const serverConfigLayer = Layer.effect(ServerConfig, serverConfig)
