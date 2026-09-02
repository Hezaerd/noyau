import { assert, describe, it } from "@effect/vitest"
import { mapAskUserAnswers } from "@noyau/server/provider/claude-sdk-messages"

describe("Claude AskUserQuestion mapping", () => {
  it("preserves every selected value in a batched answer", () => {
    assert.deepStrictEqual(
      mapAskUserAnswers({
        "Which platforms?": { optionIds: ["web", "desktop"] },
        "Which other?": { optionIds: [], freeform: "a custom platform" },
      }),
      {
        "Which platforms?": "web, desktop",
        "Which other?": "a custom platform",
      },
    )
  })
})
