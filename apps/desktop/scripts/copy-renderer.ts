import { fileURLToPath } from "node:url"

import { Effect, FileSystem, Path, Schema } from "effect"

import { scriptRuntime } from "./runtime.ts"

class MissingRendererBuild extends Schema.TaggedError<MissingRendererBuild>()(
  "MissingRendererBuild",
  { message: Schema.String },
) {}

const copyRenderer = Effect.fn("copyRenderer")(function* () {
  const path = yield* Path.Path
  const fs = yield* FileSystem.FileSystem
  const desktopDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  const webDistributionDirectory = path.resolve(desktopDirectory, "../web/dist")
  const rendererDistributionDirectory = path.resolve(desktopDirectory, "dist-electron/renderer")

  if (!(yield* fs.exists(path.join(webDistributionDirectory, "index.html")))) {
    return yield* new MissingRendererBuild({
      message: `Web renderer build not found at ${webDistributionDirectory}`,
    })
  }

  yield* fs.remove(rendererDistributionDirectory, { recursive: true, force: true })
  yield* fs.copy(webDistributionDirectory, rendererDistributionDirectory, { overwrite: true })
})

void scriptRuntime.runPromise(copyRenderer())
