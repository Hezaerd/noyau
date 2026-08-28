// @vitest-environment happy-dom

import { ProjectId } from "@noyau/contracts/ids"
import { ProjectShell } from "@noyau/contracts/shell"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Effect, Schema } from "effect"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { ProjectSwitcher } from "../src/components/sidebar/ProjectSwitcher"

Object.defineProperty(HTMLElement.prototype, "getAnimations", {
  configurable: true,
  value: () => [],
})

afterEach(() => {
  cleanup()
})

const decodeProject = Schema.decodeUnknownSync(ProjectShell)
const projects = [
  decodeProject({
    id: "10000000-0000-4000-8000-000000000001",
    name: "Noyau",
    workspaceRoot: "/workspace/noyau",
    defaultModelSelection: null,
    available: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }),
  decodeProject({
    id: "10000000-0000-4000-8000-000000000002",
    name: "Wonderschool",
    workspaceRoot: "/workspace/wonderschool",
    defaultModelSelection: null,
    available: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }),
]

describe("project switcher", () => {
  it("switches directly between real Projects without an aggregate option", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const user = userEvent.setup()
        const onSelect = vi.fn()
        render(
          <ProjectSwitcher
            projects={projects}
            selectedProject={projects[0]}
            onSelect={onSelect}
            onAdd={vi.fn()}
            onRebind={vi.fn()}
            onRemove={vi.fn()}
          />,
        )

        yield* Effect.promise(() =>
          user.click(screen.getByRole("button", { name: "Changer de Project" })),
        )

        expect(screen.queryByText("All projects")).toBeNull()
        yield* Effect.promise(() =>
          user.click(screen.getByRole("menuitemradio", { name: "Wonderschool" })),
        )
        expect(onSelect).toHaveBeenCalledWith(
          ProjectId.make("10000000-0000-4000-8000-000000000002"),
        )
      }),
    ))
})
