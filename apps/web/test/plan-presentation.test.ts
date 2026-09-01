import { describe, expect, it } from "vite-plus/test"

import { parsePlanSteps } from "../src/lib/plan-presentation"

describe("plan presentation", () => {
  it("parses provider task-list updates", () => {
    expect(parsePlanSteps("- [x] Inspect state\n- [ ] Implement the card")).toEqual([
      { completed: true, markdown: "Inspect state" },
      { completed: false, markdown: "Implement the card" },
    ])
  })

  it("keeps wrapped step content together", () => {
    expect(
      parsePlanSteps("- [ ] Implement directory listing and clone on\n  GitRuntime handlers"),
    ).toEqual([
      {
        completed: false,
        markdown: "Implement directory listing and clone on\nGitRuntime handlers",
      },
    ])
  })

  it("leaves rich markdown plans to the markdown renderer", () => {
    expect(parsePlanSteps("## Approach\nFirst inspect the current architecture.")).toBeNull()
  })
})
