import {
  DEFAULT_SERVER_SETTINGS,
  mergeServerSettings,
  ServerSettings,
  ServerSettingsError,
  ServerSettingsPatch,
} from "@noyau/contracts/settings"
import { Effect, FileSystem, Path, Schema } from "effect"

import { ServerConfig } from "../config.ts"

const decodeSettings = Schema.decodeUnknownEffect(ServerSettings)
const encodeSettings = Schema.encodeEffect(ServerSettings)

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
  const parsed = yield* Effect.try({
    try: () => JSON.parse(encoded) as unknown,
    catch: (cause) =>
      new ServerSettingsError({
        settingsPath,
        operation: "decode",
        cause,
      }),
  })
  return yield* decodeSettings(parsed).pipe(
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
  const encoded = yield* encodeSettings(settings).pipe(
    Effect.mapError(
      (cause) =>
        new ServerSettingsError({
          settingsPath,
          operation: "write-file",
          cause,
        }),
    ),
  )
  yield* fileSystem.writeFileString(settingsPath, `${JSON.stringify(encoded, null, 2)}\n`).pipe(
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
