import { Config, Context, Layer, type Redacted } from "effect"

export type NoyauEnvironment = "development" | "test" | "production"

export interface ControlPlaneConfigValue {
  readonly environment: NoyauEnvironment
  readonly databaseUrl: Redacted.Redacted
  readonly host: string
  readonly port: number
  readonly eventPollInterval: number
}

export class ControlPlaneConfig extends Context.Service<
  ControlPlaneConfig,
  ControlPlaneConfigValue
>()("@noyau/control-plane/ControlPlaneConfig") {}

export const controlPlaneConfig = Config.all({
  environment: Config.literals(["development", "test", "production"] as const, "NOYAU_ENV"),
  databaseUrl: Config.redacted("DATABASE_URL"),
  host: Config.string("HOST").pipe(Config.withDefault("127.0.0.1")),
  port: Config.port("PORT").pipe(Config.withDefault(3001)),
  eventPollInterval: Config.int("EVENT_POLL_INTERVAL_MS").pipe(Config.withDefault(500)),
})

export const controlPlaneConfigLayer = Layer.effect(ControlPlaneConfig, controlPlaneConfig)
