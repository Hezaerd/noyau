import { KEYBINDINGS_FILE_NAME, SETTINGS_FILE_NAME } from "@noyau/shared/dev-home"
import { Effect, FileSystem, Path, Result, Stream } from "effect"

const isTempWrite = (fileName: string): boolean => fileName.endsWith(".tmp")

export const configFileKindFromPath = (
  watchedPath: string,
  basename: (value: string) => string,
): "settings" | "keybindings" | undefined => {
  const fileName = basename(watchedPath)
  if (isTempWrite(fileName)) {
    return undefined
  }
  if (fileName === SETTINGS_FILE_NAME) {
    return "settings"
  }
  if (fileName === KEYBINDINGS_FILE_NAME) {
    return "keybindings"
  }
  return undefined
}

export const watchConfigDirectory = Effect.fn("watchConfigDirectory")(function* (input: {
  readonly directory: string
  readonly onSettings: Effect.Effect<void>
  readonly onKeybindings: Effect.Effect<void>
}) {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  yield* fileSystem.makeDirectory(input.directory, { recursive: true })
  return yield* fileSystem.watch(input.directory).pipe(
    Stream.filterMap((event) => {
      const kind = configFileKindFromPath(event.path, path.basename)
      return kind === undefined ? Result.failVoid : Result.succeed(kind)
    }),
    Stream.runForEach((kind) => (kind === "settings" ? input.onSettings : input.onKeybindings)),
    Effect.catch((cause) =>
      Effect.logWarning("Config directory watch ended", { directory: input.directory, cause }),
    ),
  )
})
