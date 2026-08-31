import {
  DEFAULT_SERVER_SETTINGS,
  mergeServerSettings,
  ServerSettings,
  ServerSettingsError,
  type ServerSettingsPatch,
} from "@noyau/contracts/settings"
import { ServerConfig } from "@noyau/server/config"
import { Effect, FileSystem, Path, Schema } from "effect"

const SettingsFileJson = Schema.fromJsonString(ServerSettings, { space: 2 })
const decodeSettingsFile = Schema.decodeUnknownEffect(SettingsFileJson)
const encodeSettingsFile = Schema.encodeEffect(SettingsFileJson)

export const settingsFilePath = (dataDirectory: string, path: Path.Path): string =>
  path.join(dataDirectory, "settings.json")

export const readServerSettings = Effect.fn("readServerSettings")(function* () {
  const config = yield* ServerConfig
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const settingsPath = settingsFilePath(config.dataDirectory, path)
  const exists = yield* fileSystem.exists(settingsPath)
  if (!exists) {
    return DEFAULT_SERVER_SETTINGS
  }
  const encoded = yield* fileSystem.readFileString(settingsPath).pipe(
    Effect.mapError(
      (cause) =>
        new ServerSettingsError({
          settingsPath,
          operation: "read-file",
          cause,
        }),
    ),
  )
  if (encoded.trim().length === 0) {
    return DEFAULT_SERVER_SETTINGS
  }
  return yield* decodeSettingsFile(encoded).pipe(
    Effect.mapError(
      (cause) =>
        new ServerSettingsError({
          settingsPath,
          operation: "decode",
          cause,
        }),
    ),
  )
})

export const writeServerSettings = Effect.fn("writeServerSettings")(function* (
  settings: ServerSettings,
) {
  const config = yield* ServerConfig
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const settingsPath = settingsFilePath(config.dataDirectory, path)
  const encoded = yield* encodeSettingsFile(settings).pipe(
    Effect.mapError(
      (cause) =>
        new ServerSettingsError({
          settingsPath,
          operation: "write-file",
          cause,
        }),
    ),
  )
  const temporaryPath = `${settingsPath}.tmp`
  yield* fileSystem.writeFileString(temporaryPath, `${encoded}\n`).pipe(
    Effect.andThen(fileSystem.rename(temporaryPath, settingsPath)),
    Effect.mapError(
      (cause) =>
        new ServerSettingsError({
          settingsPath,
          operation: "write-file",
          cause,
        }),
    ),
  )
  return settings
})

export const patchServerSettings = Effect.fn("patchServerSettings")(function* (
  patch: ServerSettingsPatch,
) {
  const current = yield* readServerSettings()
  return yield* writeServerSettings(mergeServerSettings(current, patch))
})
