import { describe, expect, it } from "vite-plus/test"

import { favoriteModelKey, parseFavoriteModels } from "../src/lib/model-picker-preferences"

describe("model picker preferences", () => {
  it("keeps provider/model pairs distinct when labels collide", () => {
    expect(favoriteModelKey({ provider: "cursor", modelId: "fable-5" })).not.toBe(
      favoriteModelKey({ provider: "claude", modelId: "fable-5" }),
    )
  })

  it("decodes valid favorites and rejects malformed persisted values", () => {
    expect(
      parseFavoriteModels(
        JSON.stringify([
          { provider: "claude", modelId: "fable-5" },
          { provider: "cursor", modelId: "fable-5" },
        ]),
      ),
    ).toEqual([
      { provider: "claude", modelId: "fable-5" },
      { provider: "cursor", modelId: "fable-5" },
    ])
    expect(parseFavoriteModels('{"provider":"unknown"}')).toEqual([])
  })
})
