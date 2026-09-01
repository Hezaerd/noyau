// @vitest-environment happy-dom

import type { CursorModel, Provider } from "@noyau/contracts/entities/environment"
import { ProviderInstanceId } from "@noyau/contracts/entities/environment"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { ThreadModelPicker } from "../src/components/thread/ThreadModelPicker"
import { MODEL_FAVORITES_STORAGE_KEY } from "../src/lib/model-picker-preferences"
import { AppAtomRegistryProvider, resetAppAtomRegistryForTests } from "../src/state/atom-registry"

Object.defineProperty(HTMLElement.prototype, "getAnimations", {
  configurable: true,
  value: () => [],
})

const cursor = ProviderInstanceId.make("cursor")
const claude = ProviderInstanceId.make("claude")
const codex = ProviderInstanceId.make("codex")

const model = (modelId: string, label: string, isLegacy = false): CursorModel => {
  const entry: CursorModel = {
    modelId,
    label,
    reasoningEfforts: [],
    serviceTiers: [],
  }
  if (isLegacy) Object.assign(entry, { isLegacy: true })
  return entry
}

const catalogs = {
  [cursor]: [
    model("cursor-current", "Cursor Current"),
    model("cursor-favorite", "Cursor Favorite"),
  ],
  [claude]: [
    model("claude-current", "Claude Current"),
    model("claude-legacy", "Claude Legacy", true),
  ],
  [codex]: [model("codex-favorite", "Codex Favorite")],
}

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  resetAppAtomRegistryForTests()
})

const renderPicker = ({
  selectedProvider = cursor,
  modelId = "cursor-current",
}: {
  readonly selectedProvider?: Provider
  readonly modelId?: string
} = {}) =>
  render(
    <AppAtomRegistryProvider>
      <ThreadModelPicker
        modelsByProvider={catalogs}
        availableProviders={[cursor, claude, codex]}
        selectedProvider={selectedProvider}
        modelSelection={{ modelId }}
        defaultModelSelection={null}
        disabled={false}
        onModelSelectionChange={vi.fn()}
        onProviderChange={vi.fn()}
        onDefaultModelSelectionChange={vi.fn()}
      />
    </AppAtomRegistryProvider>,
  )

const openPicker = async () => {
  const user = userEvent.setup()
  await user.click(screen.getByRole("button", { name: /Model / }))
  return user
}

const modelRowLabel = (label: string) => screen.getByText(label, { selector: "div.font-medium" })
const queryModelRowLabel = (label: string) =>
  screen.queryByText(label, { selector: "div.font-medium" })

describe("thread model picker", () => {
  it("opens on Favorites, renders providers vertically, and groups favorites first", async () => {
    window.localStorage.setItem(
      MODEL_FAVORITES_STORAGE_KEY,
      JSON.stringify([
        { provider: "cursor", modelId: "cursor-favorite" },
        { provider: "codex", modelId: "codex-favorite" },
      ]),
    )
    renderPicker()

    const user = await openPicker()
    const providerRail = screen.getByRole("tablist", { name: "Providers" })
    expect(providerRail.getAttribute("aria-orientation")).toBe("vertical")
    expect(
      within(providerRail)
        .getAllByRole("tab")
        .map((tab) => tab.getAttribute("aria-label")),
    ).toEqual(["Favorites", "Cursor", "Claude Code", "Codex"])
    expect(
      within(providerRail).getByRole("tab", { name: "Favorites" }).getAttribute("aria-selected"),
    ).toBe("true")
    expect(modelRowLabel("Cursor Favorite")).toBeTruthy()
    expect(modelRowLabel("Codex Favorite")).toBeTruthy()
    expect(queryModelRowLabel("Cursor Current")).toBeNull()

    await user.click(within(providerRail).getByRole("tab", { name: "Cursor" }))
    const favoriteRow = modelRowLabel("Cursor Favorite").closest('[data-slot="command-item"]')
    const currentRow = modelRowLabel("Cursor Current").closest('[data-slot="command-item"]')
    expect(favoriteRow).not.toBeNull()
    expect(currentRow).not.toBeNull()
    if (favoriteRow === null || currentRow === null) throw new Error("Expected both model rows")
    expect(favoriteRow.compareDocumentPosition(currentRow)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it("folds legacy models but includes them in global search", async () => {
    renderPicker({ selectedProvider: claude, modelId: "claude-current" })

    const user = await openPicker()
    expect(modelRowLabel("Claude Current")).toBeTruthy()
    expect(screen.getByText("Legacy models")).toBeTruthy()
    expect(screen.getByText("1 model")).toBeTruthy()
    expect(queryModelRowLabel("Claude Legacy")).toBeNull()

    await user.click(screen.getByText("Legacy models"))
    expect(modelRowLabel("Claude Legacy")).toBeTruthy()
    expect(
      screen
        .getByText("Legacy models")
        .closest('[data-slot="command-item"]')
        ?.getAttribute("aria-expanded"),
    ).toBe("true")

    await user.click(screen.getByText("Legacy models"))
    expect(queryModelRowLabel("Claude Legacy")).toBeNull()
    await user.type(screen.getByRole("combobox", { name: "Search a model" }), "Claude Legacy")
    expect(modelRowLabel("Claude Legacy")).toBeTruthy()
  })

  it("automatically expands the selected legacy model", async () => {
    renderPicker({ selectedProvider: claude, modelId: "claude-legacy" })

    await openPicker()
    expect(await screen.findByText("Claude Legacy", { selector: "div.font-medium" })).toBeTruthy()
    expect(
      screen
        .getByText("Legacy models")
        .closest('[data-slot="command-item"]')
        ?.getAttribute("aria-expanded"),
    ).toBe("true")
  })
})
