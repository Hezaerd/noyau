// @vitest-environment happy-dom

import type { CursorModel } from "@noyau/contracts/entities/environment"
import { cleanup, render, screen } from "@testing-library/react"
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
        cursorModels={models}
        claudeModels={[]}
        codexModels={[]}
        availableProviders={["cursor"]}
        selectedProvider="cursor"
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
    expect(screen.queryByRole("meter", { name: /Context / })).toBeNull()
  })

  it("shows the last-known fill next to Send", () => {
    renderComposer({ used: 12400, window: 200000 })
    expect(screen.getByRole("meter", { name: "Context 12.4k / 200k" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy()
  })
})
