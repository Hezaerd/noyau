import * as NodeFileSystem from "node:fs"

import { EnvironmentId } from "@noyau/contracts/ids"
import { resolveConfigDirectory } from "@noyau/shared/dev-home"
import { RELEASE_CHANNELS, type ReleaseChannel } from "@noyau/shared/release-brand"
import { Config, Context, Effect, Layer, Path, Redacted, Schema } from "effect"

import { resolveWorktreesDir } from "./worktree-home.ts"

export type NoyauEnvironment = "development" | "test" | "production"
export type NoyauReleaseChannel = ReleaseChannel

export const BootstrapConfig = Schema.Struct({
  dataDirectory: Schema.NonEmptyString,
  host: Schema.Literals(["127.0.0.1", "::1"]),
  port: Schema.Int.check(
    Schema.makeFilter((port) => port >= 0 && port <= 65_535, {
      expected: "a TCP port between 0 and 65535",
    }),
  ),
  bearerToken: Schema.NonEmptyString,
  actorId: Schema.NonEmptyString,
  environmentId: EnvironmentId,
  environmentCreatedAt: Schema.DateTimeUtcFromString,
  bootstrapVersion: Schema.NonEmptyString,
  bundleVersion: Schema.NonEmptyString,
  serverVersion: Schema.NonEmptyString,
})
export type BootstrapConfig = (typeof BootstrapConfig)["Type"]

export interface ServerConfigValue {
  readonly environment: NoyauEnvironment
  readonly dataDirectory: string
  readonly configDirectory: string
  readonly worktreesDir: string
  readonly databaseFile: string
  readonly host: string
  readonly port: number
  readonly bearerToken: Redacted.Redacted
  readonly actorId: string
  readonly environmentId: BootstrapConfig["environmentId"]
  readonly environmentCreatedAt: BootstrapConfig["environmentCreatedAt"]
  readonly bootstrapVersion: string
  readonly bundleVersion: string
  readonly serverVersion: string
}

export class ServerConfig extends Context.Service<ServerConfig, ServerConfigValue>()(
  "@noyau/server/ServerConfig",
) {}

export class BootstrapConfigError extends Schema.TaggedError<BootstrapConfigError>()(
  "BootstrapConfigError",
  {
    source: Schema.NonEmptyString,
    cause: Schema.Defect(),
  },
) {}

const decodeBootstrapJson = Schema.decodeUnknownEffect(Schema.fromJsonString(BootstrapConfig))

export const decodeBootstrap = Effect.fn("ServerConfig.decodeBootstrap")(function* (
  source: string,
  encoded: string,
) {
  return yield* decodeBootstrapJson(encoded).pipe(
    Effect.mapError((cause) => new BootstrapConfigError({ source, cause })),
  )
})

export const readBootstrapFd = Effect.fn("ServerConfig.readBootstrapFd")(function* (fd: number) {
  const source = `fd${fd}`
  const encoded = yield* Effect.callback<string, BootstrapConfigError>((resume) => {
    NodeFileSystem.readFile(fd, "utf8", (cause, contents) => {
      resume(
        cause === null
          ? Effect.succeed(contents)
          : Effect.fail(new BootstrapConfigError({ source, cause })),
      )
    })
  })
  return yield* decodeBootstrap(source, encoded)
})

const standaloneBootstrap = (dataDirectory: string) =>
  Config.all({
    dataDirectory: Config.string("NOYAU_DATA_DIR").pipe(Config.withDefault(dataDirectory)),
    host: Config.string("NOYAU_HOST").pipe(Config.withDefault("127.0.0.1")),
    port: Config.int("NOYAU_PORT").pipe(Config.withDefault(3001)),
    bearerToken: Config.string("NOYAU_BEARER_TOKEN").pipe(
      Config.withDefault("noyau-development-token"),
    ),
    actorId: Config.string("NOYAU_ACTOR_ID").pipe(Config.withDefault("human:local")),
    environmentId: Config.string("NOYAU_ENVIRONMENT_ID").pipe(
      Config.withDefault("00000000-0000-4000-8000-000000000001"),
    ),
    environmentCreatedAt: Config.string("NOYAU_ENVIRONMENT_CREATED_AT").pipe(
      Config.withDefault("1970-01-01T00:00:00.000Z"),
    ),
    bootstrapVersion: Config.string("NOYAU_BOOTSTRAP_VERSION").pipe(Config.withDefault("1")),
    bundleVersion: Config.string("NOYAU_BUNDLE_VERSION").pipe(Config.withDefault("0.0.0")),
    serverVersion: Config.string("NOYAU_SERVER_VERSION").pipe(Config.withDefault("0.0.0")),
  })

interface StandaloneBootstrapInput {
  readonly dataDirectory: string
  readonly host: string
  readonly port: number
  readonly bearerToken: string
  readonly actorId: string
  readonly environmentId: string
  readonly environmentCreatedAt: string
  readonly bootstrapVersion: string
  readonly bundleVersion: string
  readonly serverVersion: string
}

const decodeStandaloneBootstrap = Effect.fn("ServerConfig.decodeStandaloneBootstrap")(function* (
  input: StandaloneBootstrapInput,
) {
  return yield* Schema.decodeUnknownEffect(BootstrapConfig)(input).pipe(
    Effect.mapError(
      (cause) => new BootstrapConfigError({ source: "standalone configuration", cause }),
    ),
  )
})

export const serverEnvironment = Config.literals(
  ["development", "test", "production"] as const,
  "NOYAU_ENV",
).pipe(Config.withDefault("development"))

export const serverReleaseChannel = Config.literals(RELEASE_CHANNELS, "NOYAU_RELEASE_CHANNEL").pipe(
  Config.withDefault("development"),
)

export const loadServerConfig = Effect.gen(function* () {
  const path = yield* Path.Path
  const environment = yield* serverEnvironment
  const releaseChannel = yield* serverReleaseChannel
  const homeDirectory = yield* Config.string("HOME").pipe(
    Config.orElse(() => Config.string("USERPROFILE")),
  )
  const bootstrapFd = yield* Config.option(Config.int("NOYAU_BOOTSTRAP_FD"))
  const configuredHome = yield* Config.option(Config.string("NOYAU_HOME"))
  const configuredDataDirectory = yield* Config.option(Config.string("NOYAU_DATA_DIR"))
  const defaultDataDirectory =
    configuredHome._tag === "Some" ? path.resolve(configuredHome.value) : path.resolve(".noyau")
  const bootstrap =
    bootstrapFd._tag === "Some"
      ? yield* readBootstrapFd(bootstrapFd.value)
      : yield* standaloneBootstrap(defaultDataDirectory).pipe(
          Effect.flatMap(decodeStandaloneBootstrap),
        )
  const explicitHome = configuredHome._tag === "Some" || configuredDataDirectory._tag === "Some"
  return {
    environment,
    dataDirectory: bootstrap.dataDirectory,
    configDirectory: resolveConfigDirectory({
      join: path.join,
      dataDirectory: bootstrap.dataDirectory,
      homeDirectory,
      releaseChannel,
      explicitHome,
    }),
    worktreesDir: resolveWorktreesDir(path.join, homeDirectory, releaseChannel),
    databaseFile: path.join(bootstrap.dataDirectory, "noyau.sqlite"),
    host: bootstrap.host,
    port: bootstrap.port,
    bearerToken: Redacted.make(bootstrap.bearerToken),
    actorId: bootstrap.actorId,
    environmentId: bootstrap.environmentId,
    environmentCreatedAt: bootstrap.environmentCreatedAt,
    bootstrapVersion: bootstrap.bootstrapVersion,
    bundleVersion: bootstrap.bundleVersion,
    serverVersion: bootstrap.serverVersion,
  } satisfies ServerConfigValue
})

export const serverConfigLayer = Layer.effect(ServerConfig, loadServerConfig)
