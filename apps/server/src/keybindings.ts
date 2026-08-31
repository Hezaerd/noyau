import {
  decodeKeybindingsFile,
  encodeKeybindingsFile,
  KeybindingsError,
  type KeybindingRule,
} from "@noyau/contracts/keybindings"
import { ServerConfig } from "@noyau/server/config"
import { KEYBINDINGS_FILE_NAME } from "@noyau/shared/dev-home"
import { Effect, FileSystem, Path } from "effect"

export const keybindingsFilePath = (configDirectory: string, path: Path.Path): string =>
  path.join(configDirectory, KEYBINDINGS_FILE_NAME)

export type KeybindingsRead = {
  readonly rules: ReadonlyArray<KeybindingRule>
  readonly ok: boolean
}

export const readKeybindingsRules = Effect.fn("readKeybindingsRules")(function* () {
  const config = yield* ServerConfig
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const keybindingsPath = keybindingsFilePath(config.configDirectory, path)
  const exists = yield* fileSystem.exists(keybindingsPath)
  if (!exists) {
    return { rules: [], ok: true } satisfies KeybindingsRead
  }
  const encoded = yield* fileSystem.readFileString(keybindingsPath).pipe(
    Effect.mapError(
      (cause) =>
        new KeybindingsError({
          keybindingsPath,
          operation: "read-file",
          cause,
        }),
    ),
  )
  if (encoded.trim().length === 0) {
    return { rules: [], ok: true } satisfies KeybindingsRead
  }
  return yield* decodeKeybindingsFile(encoded).pipe(
    Effect.map((rules) => ({ rules, ok: true }) satisfies KeybindingsRead),
    Effect.catch((cause) =>
      Effect.logWarning("Ignoring invalid keybindings.json", { cause }).pipe(
        Effect.as({ rules: [], ok: false } satisfies KeybindingsRead),
      ),
    ),
  )
})

export const writeKeybindingsRules = Effect.fn("writeKeybindingsRules")(function* (
  rules: ReadonlyArray<KeybindingRule>,
) {
  const config = yield* ServerConfig
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const keybindingsPath = keybindingsFilePath(config.configDirectory, path)
  const encoded = yield* encodeKeybindingsFile(rules).pipe(
    Effect.mapError(
      (cause) =>
        new KeybindingsError({
          keybindingsPath,
          operation: "write-file",
          cause,
        }),
    ),
  )
  yield* fileSystem.makeDirectory(config.configDirectory, { recursive: true }).pipe(
    Effect.mapError(
      (cause) =>
        new KeybindingsError({
          keybindingsPath,
          operation: "write-file",
          cause,
        }),
    ),
  )
  const temporaryPath = `${keybindingsPath}.tmp`
  yield* fileSystem.writeFileString(temporaryPath, `${encoded}\n`).pipe(
    Effect.andThen(fileSystem.rename(temporaryPath, keybindingsPath)),
    Effect.mapError(
      (cause) =>
        new KeybindingsError({
          keybindingsPath,
          operation: "write-file",
          cause,
        }),
    ),
  )
  return rules
})
