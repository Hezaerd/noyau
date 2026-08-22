import { assert, layer } from "@effect/vitest"
import { promptContentBlocks } from "@noyau/server/provider/prompt-blocks"
import { Effect, Path } from "effect"

layer(Path.layer)("promptContentBlocks", (it) => {
  it.effect("keeps a plain prompt as a single text block", () =>
    Effect.gen(function* () {
      const blocks = yield* promptContentBlocks("Implement the adapter", "/tmp/workspace")
      assert.deepStrictEqual(blocks, [{ type: "text", text: "Implement the adapter" }])
    }),
  )

  it.effect("encodes in-workspace mentions as resource_link", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const workspace = path.resolve("/tmp/workspace")
      const fileUrl = yield* path.toFileUrl(path.join(workspace, "src/a.ts"))
      const blocks = yield* promptContentBlocks("look at @src/a.ts please", workspace)
      assert.deepStrictEqual(blocks, [
        { type: "text", text: "look at " },
        { type: "resource_link", name: "a.ts", uri: fileUrl.href },
        { type: "text", text: " please" },
      ])
    }),
  )

  it.effect("leaves mentions that escape the workspace as text", () =>
    Effect.gen(function* () {
      const blocks = yield* promptContentBlocks("look at @../secret.ts", "/tmp/workspace")
      assert.deepStrictEqual(blocks, [{ type: "text", text: "look at @../secret.ts" }])
    }),
  )
})
