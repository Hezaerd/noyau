// @vitest-environment happy-dom

import { ProjectId } from "@noyau/protocol/ids"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Effect } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { ProjectAgentIntegrationSetup } from "../src/components/ProjectAgentIntegrationSetup"

const { installProjectAgentIntegration } = vi.hoisted(() => ({
  installProjectAgentIntegration: vi.fn(),
}))

vi.mock("@/lib/control-plane", () => ({ installProjectAgentIntegration }))

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")

beforeEach(() => {
  installProjectAgentIntegration.mockResolvedValue({
    ok: true,
    value: {
      projectId,
      skillName: "noyau",
      targetPath: "/workspace/.agents/skills/noyau",
      currentVersion: "1.0.0",
      installedVersion: "1.0.0",
      status: "current",
    },
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("Project agent integration setup", () => {
  it("installs explicitly before finishing the setup", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const user = userEvent.setup()
        const onDone = vi.fn()
        render(<ProjectAgentIntegrationSetup projectId={projectId} onDone={onDone} />)

        yield* Effect.promise(() =>
          user.click(screen.getByRole("button", { name: "Installer le skill Noyau" })),
        )
        expect(installProjectAgentIntegration).toHaveBeenCalledWith({ projectId })
        expect(
          yield* Effect.promise(() => screen.findByText("Intégration agent installée")),
        ).toBeTruthy()
        expect(onDone).not.toHaveBeenCalled()

        yield* Effect.promise(() => user.click(screen.getByRole("button", { name: "Terminer" })))
        expect(onDone).toHaveBeenCalledOnce()
      }),
    ))

  it("allows postponing without installing", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const user = userEvent.setup()
        const onDone = vi.fn()
        render(<ProjectAgentIntegrationSetup projectId={projectId} onDone={onDone} />)

        yield* Effect.promise(() => user.click(screen.getByRole("button", { name: "Plus tard" })))
        expect(installProjectAgentIntegration).not.toHaveBeenCalled()
        expect(onDone).toHaveBeenCalledOnce()
      }),
    ))
})
