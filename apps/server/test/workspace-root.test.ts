import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, describe, it } from "@effect/vitest"
import { WorkspaceRoot } from "@noyau/protocol/entities/environment"
import { WorkspaceRootAccess, workspaceRootAccessLayer } from "@noyau/server/workspace-root"
import { Effect, Schema } from "effect"

describe("WorkspaceRootAccess", () => {
  it.effect("accepts only an accessible existing directory", () => {
    const directory = mkdtempSync(join(tmpdir(), "noyau-workspace-root-"))
    const file = join(directory, "file.txt")
    const missing = join(directory, "missing")
    writeFileSync(file, "not a directory")
    const available = Schema.decodeSync(WorkspaceRoot)(directory)
    const regularFile = Schema.decodeSync(WorkspaceRoot)(file)
    const nonexistent = Schema.decodeSync(WorkspaceRoot)(missing)

    return Effect.gen(function* () {
      const access = yield* WorkspaceRootAccess
      assert.isTrue(yield* access.isAvailable(available))
      assert.isFalse(yield* access.isAvailable(regularFile))
      assert.isFalse(yield* access.isAvailable(nonexistent))
    }).pipe(
      Effect.provide(workspaceRootAccessLayer),
      Effect.provide(NodeFileSystem.layer),
      Effect.ensuring(
        Effect.sync(() => {
          rmSync(directory, { force: true, recursive: true })
        }),
      ),
    )
  })
})
