import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, layer } from "@effect/vitest"
import { searchWorkspacePathsInRoot } from "@noyau/server/workspace-path-search"
import { Effect, FileSystem, Layer, Path } from "effect"

const platformLayer = Layer.mergeAll(NodeFileSystem.layer, Path.layer)

layer(platformLayer)("searchWorkspacePathsInRoot", (it) => {
  it.effect("ranks basename matches and skips ignored directories", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const workspace = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-paths-" })
      yield* fileSystem.makeDirectory(path.join(workspace, "src"), { recursive: true })
      yield* fileSystem.writeFileString(path.join(workspace, "src/adapter.ts"), "export {}\n")
      yield* fileSystem.writeFileString(path.join(workspace, "src/other.ts"), "export {}\n")
      yield* fileSystem.makeDirectory(path.join(workspace, "node_modules", "pkg"), {
        recursive: true,
      })
      yield* fileSystem.writeFileString(path.join(workspace, "node_modules/pkg/adapter.ts"), "")

      const result = yield* searchWorkspacePathsInRoot(workspace, "adapter")
      assert.deepStrictEqual(result.entries, [{ path: "src/adapter.ts", kind: "file" }])
    }),
  )

  it.effect("includes .agents files and directories for empty queries", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const workspace = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-agents-" })
      yield* fileSystem.makeDirectory(path.join(workspace, ".agents", "skills", "grill"), {
        recursive: true,
      })
      yield* fileSystem.writeFileString(
        path.join(workspace, ".agents/skills/grill/SKILL.md"),
        "# Grill\n",
      )

      const result = yield* searchWorkspacePathsInRoot(workspace, "skill")
      assert.ok(result.entries.some((entry) => entry.path === ".agents/skills/grill/SKILL.md"))
    }),
  )
})
