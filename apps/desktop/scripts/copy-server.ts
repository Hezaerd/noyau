import { fileURLToPath } from "node:url"

import { Effect, FileSystem, Path } from "effect"

import { scriptRuntime } from "./runtime.ts"

const copyServer = Effect.fn("copyServer")(function* () {
  const path = yield* Path.Path
  const fs = yield* FileSystem.FileSystem
  const desktopDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  const serverBundle = path.resolve(desktopDirectory, "../server/dist/main.mjs")
  const targetDirectory = path.join(desktopDirectory, "dist-electron", "server")

  yield* fs.makeDirectory(targetDirectory, { recursive: true })
  yield* fs.copyFile(serverBundle, path.join(targetDirectory, "main.mjs"))
})

void scriptRuntime.runPromise(copyServer())
