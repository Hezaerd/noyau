import { describe, expect, it } from "vite-plus/test"

import {
  favoriteModelKey,
  parseFavoriteModels,
  resolveDraftDefaultModelSelection,
} from "../src/lib/model-picker-preferences"

const model = (modelId: string) => ({
  modelId,
  label: modelId,
  reasoningEfforts: [],
  serviceTiers: [],
})

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
    expect(
      parseFavoriteModels(JSON.stringify([{ provider: "codex_work", modelId: "gpt-5" }])),
    ).toEqual([{ provider: "codex_work", modelId: "gpt-5" }])
  })

  it("keeps an explicit model outside the catalog while its provider remains available", () => {
    const stored = { provider: "claude", modelSelection: { modelId: "custom-model" } } as const

    expect(
      resolveDraftDefaultModelSelection({
        stored,
        availableProviders: ["cursor", "claude"],
        modelsByProvider: {
          cursor: [model("composer")],
          claude: [model("fable-5")],
          codex: [],
        },
      }),
    ).toBe(stored)
  })

  it("falls back to the first ready provider without rewriting the stored preference", () => {
    expect(
      resolveDraftDefaultModelSelection({
        stored: { provider: "claude", modelSelection: { modelId: "fable-5" } },
        availableProviders: ["cursor"],
        modelsByProvider: {
          cursor: [model("composer")],
          claude: [model("fable-5")],
          codex: [],
        },
      }),
    ).toEqual({ provider: "cursor", modelSelection: { modelId: "composer" } })
  })
})
