import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, layer } from "@effect/vitest"
import { WorkspaceRoot } from "@noyau/protocol/entities/environment"
import { WorkspaceRootAccess, workspaceRootAccessLayer } from "@noyau/server/workspace-root"
import { Context, Effect, FileSystem, Layer, Path, Schema } from "effect"

const platformLayer = Layer.mergeAll(NodeFileSystem.layer, Path.layer)

layer(platformLayer)("WorkspaceRootAccess", (it) => {
  it.effect("accepts only an accessible existing directory", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "noyau-workspace-root-",
      })
      const file = path.join(directory, "file.txt")
      const missing = path.join(directory, "missing")
      yield* fileSystem.writeFileString(file, "not a directory")
      const available = yield* Schema.decodeEffect(WorkspaceRoot)(directory)
      const regularFile = yield* Schema.decodeEffect(WorkspaceRoot)(file)
      const nonexistent = yield* Schema.decodeEffect(WorkspaceRoot)(missing)

      const services = yield* Layer.build(workspaceRootAccessLayer)
      const access = Context.get(services, WorkspaceRootAccess)
      assert.isTrue(yield* access.isAvailable(available))
      assert.isFalse(yield* access.isAvailable(regularFile))
      assert.isFalse(yield* access.isAvailable(nonexistent))
    }),
  )
})
