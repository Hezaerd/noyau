import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, layer } from "@effect/vitest"
import { GitRuntime, gitRuntimeLayer } from "@noyau/server/git/git-runtime"
import { runGit } from "@noyau/server/git/run-command"
import { parseTurnDiffNumstat } from "@noyau/server/git/turn-diff"
import { Effect, FileSystem, Layer, Path } from "effect"

const testLayer = Layer.mergeAll(gitRuntimeLayer, NodeServices.layer)

layer(testLayer)("GitRuntime checkpoints", (it) => {
  it.effect("capture deux refs et diff les fichiers ajoutés", () =>
    Effect.gen(function* () {
      const git = yield* GitRuntime
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-checkpoint-" })
      yield* runGit("git.init", cwd, ["init"])
      yield* runGit("git.config-email", cwd, ["config", "user.email", "test@noyau.local"])
      yield* runGit("git.config-name", cwd, ["config", "user.name", "Noyau Test"])
      yield* fileSystem.writeFileString(path.join(cwd, "README.md"), "hello\n")
      yield* runGit("git.add", cwd, ["add", "README.md"])
      yield* runGit("git.commit", cwd, ["commit", "-m", "init"])

      const from = "refs/noyau/checkpoint/10000000-0000-4000-8000-000000000001/0"
      const to = "refs/noyau/checkpoint/10000000-0000-4000-8000-000000000001/1"
      yield* git.captureCheckpoint({ cwd, checkpointRef: from })
      yield* fileSystem.writeFileString(path.join(cwd, "src.ts"), "export const x = 1\n")
      yield* git.captureCheckpoint({ cwd, checkpointRef: to })

      assert.isTrue(yield* git.hasCheckpointRef({ cwd, checkpointRef: from }))
      assert.isTrue(yield* git.hasCheckpointRef({ cwd, checkpointRef: to }))
      const numstat = yield* git.diffCheckpoints({
        cwd,
        fromCheckpointRef: from,
        toCheckpointRef: to,
      })
      const files = parseTurnDiffNumstat(numstat)
      assert.strictEqual(
        files.some((file) => file.path === "src.ts"),
        true,
      )
      const patch = yield* git.diffCheckpoints({
        cwd,
        fromCheckpointRef: from,
        toCheckpointRef: to,
        format: "patch",
      })
      assert.strictEqual(patch.includes("diff --git"), true)
      assert.strictEqual(patch.includes("src.ts"), true)
    }),
  )
})
