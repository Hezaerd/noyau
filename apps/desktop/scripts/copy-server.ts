import { fileURLToPath } from "node:url"

import { findBareRuntimeImports } from "@noyau/server/pack-deps"
import { Effect, FileSystem, Path, Schema } from "effect"

import { scriptRuntime } from "./runtime.ts"

class ServerBundleNotSelfContained extends Schema.TaggedError<ServerBundleNotSelfContained>()(
  "ServerBundleNotSelfContained",
  { message: Schema.String },
) {}

const copyServer = Effect.fn("copyServer")(function* () {
  const path = yield* Path.Path
  const fs = yield* FileSystem.FileSystem
  const desktopDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  const serverBundle = path.resolve(desktopDirectory, "../server/dist/main.mjs")
  const targetDirectory = path.join(desktopDirectory, "dist-electron", "server")

  const source = yield* fs.readFileString(serverBundle)
  const leftover = findBareRuntimeImports(source)
  if (leftover.length > 0) {
    return yield* new ServerBundleNotSelfContained({
      message: `Server bundle still imports ${leftover.join(", ")}. The packaged .app has no node_modules.`,
    })
  }

  yield* fs.makeDirectory(targetDirectory, { recursive: true })
  yield* fs.copyFile(serverBundle, path.join(targetDirectory, "main.mjs"))
})

void scriptRuntime.runPromise(copyServer())
