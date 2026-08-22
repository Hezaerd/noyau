import { fileURLToPath } from "node:url"

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, layer } from "@effect/vitest"
import { NOYAU_AGENT_SKILL } from "@noyau/server/agent-skill/catalog"
import { Effect, FileSystem } from "effect"

layer(NodeFileSystem.layer)("Noyau agent skill catalog", (it) => {
  it.effect("embeds the canonical skill files without drift", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      for (const file of NOYAU_AGENT_SKILL.files) {
        const source = fileURLToPath(new URL(`../../../skills/noyau/${file.path}`, import.meta.url))
        assert.strictEqual(yield* fileSystem.readFileString(source), file.content)
      }
    }),
  )

  it("keeps a concise valid root skill with resolvable references", () => {
    const root = NOYAU_AGENT_SKILL.files.find((file) => file.path === "SKILL.md")
    assert.isDefined(root)
    assert.match(root.content, /^---\nname: noyau\ndescription: .+\n---\n/u)
    assert.notMatch(root.content, /TODO/u)
    assert.isAtMost(root.content.split("\n").length, 500)
    for (const reference of root.content.matchAll(/\(references\/(.+?\.md)\)/gu)) {
      assert.isTrue(
        NOYAU_AGENT_SKILL.files.some((file) => file.path === `references/${reference[1]}`),
      )
    }
  })
})
