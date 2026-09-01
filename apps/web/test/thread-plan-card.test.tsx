// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vite-plus/test"

import { ThreadPlanCard } from "../src/components/thread/ThreadPlanCard"

afterEach(cleanup)

describe("thread plan card", () => {
  it("shows progress and the current step while a plan is running", () => {
    render(
      <ThreadPlanCard
        markdown={"- [x] Inspect state\n- [ ] Build the plan card\n- [ ] Verify it"}
        active
      />,
    )

    expect(screen.getByText("1 of 3 steps complete")).toBeTruthy()
    expect(screen.getAllByText("In progress")).toHaveLength(2)
    expect(screen.getByText("Build the plan card")).toBeTruthy()
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("33")
  })

  it("celebrates a completed plan", () => {
    render(<ThreadPlanCard markdown={"- [x] Inspect state\n- [x] Ship it"} active={false} />)

    expect(screen.getByText("Plan complete")).toBeTruthy()
    expect(screen.queryByText("In progress")).toBeNull()
  })

  it("preserves rich markdown plans", () => {
    render(<ThreadPlanCard markdown={"## Approach\nKeep **all** of the detail."} active={false} />)

    expect(screen.getByText("Proposed approach")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Approach" })).toBeTruthy()
  })
})
