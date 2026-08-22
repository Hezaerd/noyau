// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Effect } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { ProjectFolderDialog } from "../src/components/ProjectFolderDialog"
import { ControlPlaneContext } from "../src/lib/control-plane-state"

const { pickProjectFolder } = vi.hoisted(() => ({
  pickProjectFolder: vi.fn(),
}))

vi.mock("@/lib/project-folder", () => ({
  pickProjectFolder,
  submitProjectFolder: vi.fn(),
}))

Object.defineProperty(HTMLElement.prototype, "getAnimations", {
  configurable: true,
  value: () => [],
})

const controlPlaneValue = {
  shell: undefined,
  cursor: undefined,
  projects: [],
  threads: [],
  lastProjectId: undefined,
  subscriptionStatus: undefined,
  selectProject: () => undefined,
}

const renderDialog = () =>
  render(
    <ControlPlaneContext.Provider value={controlPlaneValue}>
      <ProjectFolderDialog open projectId={undefined} onOpenChange={vi.fn()} />
    </ControlPlaneContext.Provider>,
  )

beforeEach(() => {
  pickProjectFolder.mockResolvedValue({ ok: true, value: "/Users/moi/Projet" })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("project folder dialog browse", () => {
  it("fills the workspace root from the Desktop picker", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const user = userEvent.setup()
        renderDialog()

        yield* Effect.promise(() => user.click(screen.getByRole("button", { name: "Parcourir" })))
        expect(pickProjectFolder).toHaveBeenCalled()
        expect(screen.getByDisplayValue("/Users/moi/Projet")).toBeTruthy()
        expect(screen.getByDisplayValue("Projet")).toBeTruthy()
      }),
    ))

  it("shows an inline failure when the picker cannot open", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        pickProjectFolder.mockResolvedValue({
          ok: false,
          failure: {
            _tag: "InvalidInput",
            message: "Impossible d’ouvrir le sélecteur de dossier.",
          },
        })
        const user = userEvent.setup()
        renderDialog()

        yield* Effect.promise(() => user.click(screen.getByRole("button", { name: "Parcourir" })))
        expect(
          yield* Effect.promise(() =>
            screen.findByText("Impossible d’ouvrir le sélecteur de dossier."),
          ),
        ).toBeTruthy()
        expect(screen.queryByDisplayValue("/Users/moi/Projet")).toBeNull()
      }),
    ))
})
