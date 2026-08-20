// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { ProjectDeleteConfirmDialog } from "../src/components/sidebar/ProjectDeleteConfirmDialog"

Object.defineProperty(HTMLElement.prototype, "getAnimations", {
  configurable: true,
  value: () => [],
})

afterEach(() => {
  cleanup()
})

describe("project delete confirmation", () => {
  it("does not remove the Project until the confirmation is accepted", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const user = userEvent.setup()
        const onConfirm = vi.fn()
        render(
          <ProjectDeleteConfirmDialog
            open
            projectName="Noyau"
            threadCount={0}
            onOpenChange={vi.fn()}
            onConfirm={onConfirm}
          />,
        )

        expect(screen.getByRole("alertdialog")).toBeTruthy()
        expect(screen.getByText(/quittera Noyau/)).toBeTruthy()
        expect(screen.getByText(/n’est pas modifié/)).toBeTruthy()
        expect(screen.queryByText(/Thread/)).toBeNull()
        yield* Effect.promise(() => user.click(screen.getByRole("button", { name: "Annuler" })))
        expect(onConfirm).not.toHaveBeenCalled()

        yield* Effect.promise(() => user.click(screen.getByRole("button", { name: "Retirer" })))
        expect(onConfirm).toHaveBeenCalledTimes(1)
      }),
    ))

  it("mentions a single Thread or several", () => {
    const { rerender } = render(
      <ProjectDeleteConfirmDialog
        open
        projectName="Noyau"
        threadCount={1}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByText(/Son Thread disparaîtra/)).toBeTruthy()

    rerender(
      <ProjectDeleteConfirmDialog
        open
        projectName="Noyau"
        threadCount={3}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByText(/Ses 3 Threads disparaîtront/)).toBeTruthy()
  })
})
