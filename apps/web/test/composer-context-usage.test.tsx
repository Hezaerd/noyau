// @vitest-environment happy-dom

import type { CursorModel } from "@noyau/contracts/entities/environment"
import { ProviderInstanceId } from "@noyau/contracts/entities/environment"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { ThreadComposer } from "../src/components/thread/ThreadComposer"
import { AppAtomRegistryProvider, resetAppAtomRegistryForTests } from "../src/state/atom-registry"

afterEach(() => {
  cleanup()
  resetAppAtomRegistryForTests()
})

const model = (modelId: string, label: string): CursorModel => ({
  modelId,
  label,
  reasoningEfforts: [],
  serviceTiers: [],
})

const models = [model("composer-2.5", "Composer 2.5")]

const renderComposer = (contextUsage?: { readonly used: number; readonly window: number }) =>
  render(
    <AppAtomRegistryProvider>
      <ThreadComposer
        isRunning={false}
        disabled={false}
        text="hello"
        images={[]}
        runtimeMode="full-access"
        models={models}
        modelsByProvider={{ cursor: models }}
        availableProviders={[ProviderInstanceId.make("cursor")]}
        selectedProvider={ProviderInstanceId.make("cursor")}
        modelSelection={{ modelId: "composer-2.5" }}
        defaultModelSelection={null}
        error={undefined}
        contextUsage={contextUsage}
        onSubmit={vi.fn()}
        onTextChange={vi.fn()}
        onRuntimeModeChange={vi.fn()}
        onModelSelectionChange={vi.fn()}
        onDefaultModelSelectionChange={vi.fn()}
        onPaste={vi.fn()}
        onDrop={vi.fn()}
        onImageRemove={vi.fn()}
        onInterrupt={vi.fn()}
      />
    </AppAtomRegistryProvider>,
  )

describe("composer context usage", () => {
  it("hides the ring until a provider reports fill", () => {
    renderComposer()
    expect(screen.queryByRole("button", { name: /Context window/ })).toBeNull()
  })

  it("shows the last-known fill next to Send", () => {
    renderComposer({ used: 12400, window: 200000 })
    const trigger = screen.getByRole("button", { name: "Context window 6.2% used" })
    expect(trigger).toBeTruthy()
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy()
  })

  it("opens details with percentage, usage, remaining tokens, and a bounded progress bar", async () => {
    renderComposer({ used: 12400, window: 200000 })

    await userEvent.setup().click(screen.getByRole("button", { name: "Context window 6.2% used" }))

    expect(screen.getByText("Context window")).toBeTruthy()
    expect(screen.getByText("6.2%", { exact: false })).toBeTruthy()
    expect(screen.getByText("12.4k / 200k")).toBeTruthy()
    expect(screen.getByText("188k")).toBeTruthy()
    expect(
      screen
        .getByRole("progressbar", { name: "Context window usage" })
        .getAttribute("aria-valuenow"),
    ).toBe("6.2")
    expect(
      screen
        .getByRole("progressbar", { name: "Context window usage" })
        .getAttribute("aria-valuetext"),
    ).toBe("6.2%")
  })

  it("keeps the ring and progress bar bounded when usage overflows", async () => {
    renderComposer({ used: 250000, window: 200000 })
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Context window 100% used" }))

    expect(
      screen
        .getByRole("progressbar", { name: "Context window usage" })
        .getAttribute("aria-valuenow"),
    ).toBe("100")
    expect(screen.getByText("0")).toBeTruthy()
  })
})
