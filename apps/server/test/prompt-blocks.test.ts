import { assert, layer } from "@effect/vitest"
import { formatTicketPromptText, promptContentBlocks } from "@noyau/server/provider/prompt-blocks"
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

  it.effect("encodes known ticket mentions as a structured text block", () =>
    Effect.gen(function* () {
      const ticketId = "40818da4-a4de-46f6-a60f-1aa305093a6e"
      const ticket = {
        ticketId,
        title: "Mentioner ticket dans transcript",
        columnName: "En cours",
        done: false,
        description: "Donner le Ticket à l'agent.",
      }
      const blocks = yield* promptContentBlocks(
        `travaille sur @ticket:${ticketId}`,
        "/tmp/workspace",
        [ticket],
      )
      assert.deepStrictEqual(blocks, [
        { type: "text", text: "travaille sur " },
        { type: "text", text: formatTicketPromptText(ticket) },
      ])
    }),
  )

  it.effect("leaves unknown ticket mentions as source text", () =>
    Effect.gen(function* () {
      const ticketId = "40818da4-a4de-46f6-a60f-1aa305093a6e"
      const blocks = yield* promptContentBlocks(
        `travaille sur @ticket:${ticketId}`,
        "/tmp/workspace",
      )
      assert.deepStrictEqual(blocks, [{ type: "text", text: `travaille sur @ticket:${ticketId}` }])
    }),
  )
})
