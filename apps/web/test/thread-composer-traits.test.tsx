// @vitest-environment happy-dom

import type { CursorModel } from "@noyau/contracts/entities/environment"
import { ProviderInstanceId } from "@noyau/contracts/entities/environment"
import type { ModelSelection } from "@noyau/contracts/entities/model-selection"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { ThreadComposer } from "../src/components/thread/ThreadComposer"
import {
  composerPromptFieldCaretOffset,
  setComposerPromptFieldCaret,
} from "../src/lib/composer-prompt-field"
import { AppAtomRegistryProvider, resetAppAtomRegistryForTests } from "../src/state/atom-registry"

Object.defineProperty(HTMLElement.prototype, "getAnimations", {
  configurable: true,
  value: () => [],
})

afterEach(() => {
  cleanup()
  resetAppAtomRegistryForTests()
})

const model = (overrides?: Partial<CursorModel>): CursorModel => ({
  modelId: "composer-2.5",
  label: "Composer 2.5",
  reasoningEfforts: [
    {
      value: "medium",
      label: "medium",
      description: "Balances speed and reasoning depth for everyday tasks.",
      isDefault: true,
    },
    {
      value: "high",
      label: "high",
      description: "Greater reasoning depth for complex problems.",
    },
  ],
  serviceTiers: [
    { value: "standard", label: "Standard", isDefault: true },
    { value: "fast", label: "Fast", description: "1.5x speed, increased usage" },
  ],
  ...overrides,
})

const renderComposer = ({
  catalog = [model()],
  modelSelection = { modelId: "composer-2.5", reasoningEffort: "medium", serviceTier: "fast" },
  onModelSelectionChange = vi.fn(),
}: {
  readonly catalog?: ReadonlyArray<CursorModel>
  readonly modelSelection?: ModelSelection | null
  readonly onModelSelectionChange?: (selection: ModelSelection | null) => void
} = {}) =>
  render(
    <AppAtomRegistryProvider>
      <ThreadComposer
        isRunning={false}
        disabled={false}
        text="hello world"
        images={[]}
        runtimeMode="full-access"
        models={catalog}
        modelsByProvider={{ cursor: catalog }}
        availableProviders={[ProviderInstanceId.make("cursor")]}
        selectedProvider={ProviderInstanceId.make("cursor")}
        modelSelection={modelSelection}
        defaultModelSelection={null}
        error={undefined}
        onSubmit={vi.fn()}
        onTextChange={vi.fn()}
        onRuntimeModeChange={vi.fn()}
        onModelSelectionChange={onModelSelectionChange}
        onDefaultModelSelectionChange={vi.fn()}
        onPaste={vi.fn()}
        onDrop={vi.fn()}
        onImageRemove={vi.fn()}
        onInterrupt={vi.fn()}
      />
    </AppAtomRegistryProvider>,
  )

const composerField = () => screen.getByRole("textbox", { name: "Compose a message" })

describe("thread composer traits", () => {
  it("groups reasoning and service tier in one dropdown", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const user = userEvent.setup()
        const onModelSelectionChange = vi.fn()
        renderComposer({ onModelSelectionChange })
        yield* Effect.promise(() => Promise.resolve())

        expect(screen.getByRole("button", { name: "Configuration" }).textContent).toContain(
          "medium",
        )

        yield* Effect.promise(() =>
          user.click(screen.getByRole("button", { name: "Configuration" })),
        )
        expect(screen.getByText("Reasoning")).toBeTruthy()
        expect(screen.getByText("Service tier")).toBeTruthy()
        expect(screen.getByRole("menuitemradio", { name: /high/ })).toBeTruthy()
        expect(screen.getByRole("menuitemradio", { name: /Fast/ })).toBeTruthy()

        yield* Effect.promise(() => user.click(screen.getByRole("menuitemradio", { name: /high/ })))
        expect(onModelSelectionChange).toHaveBeenCalledWith({
          modelId: "composer-2.5",
          reasoningEffort: "high",
          serviceTier: "fast",
        })
      }),
    ))

  it("changes the service tier from the model configuration dropdown", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const user = userEvent.setup()
        const onModelSelectionChange = vi.fn()
        renderComposer({ onModelSelectionChange })
        yield* Effect.promise(() => Promise.resolve())

        yield* Effect.promise(() =>
          user.click(screen.getByRole("button", { name: "Configuration" })),
        )
        expect(screen.getByRole("menuitemradio", { name: /Standard/ })).toBeTruthy()
        expect(screen.getByRole("menuitemradio", { name: /high/ })).toBeTruthy()

        yield* Effect.promise(() =>
          user.click(screen.getByRole("menuitemradio", { name: /Standard/ })),
        )
        expect(onModelSelectionChange).toHaveBeenCalledWith({
          modelId: "composer-2.5",
          reasoningEffort: "medium",
        })
      }),
    ))

  it("clears a service tier override when the provider does not advertise a default", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const user = userEvent.setup()
        const onModelSelectionChange = vi.fn()
        renderComposer({
          catalog: [
            model({
              serviceTiers: [
                { value: "fast", label: "Fast", description: "1.5x speed, increased usage" },
              ],
            }),
          ],
          onModelSelectionChange,
        })
        yield* Effect.promise(() => Promise.resolve())

        yield* Effect.promise(() =>
          user.click(screen.getByRole("button", { name: "Configuration" })),
        )
        expect(screen.getByRole("menuitemradio", { name: /^Default$/ })).toBeTruthy()
        expect(screen.queryByText("Use the provider's default service tier.")).toBeNull()

        yield* Effect.promise(() =>
          user.click(screen.getByRole("menuitemradio", { name: /^Default$/ })),
        )
        expect(onModelSelectionChange).toHaveBeenCalledWith({
          modelId: "composer-2.5",
          reasoningEffort: "medium",
        })
      }),
    ))

  it("keeps a provider tier whose value matches the default menu marker", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const user = userEvent.setup()
        const onModelSelectionChange = vi.fn()
        renderComposer({
          catalog: [
            model({
              serviceTiers: [{ value: "__noyau_default_service_tier__", label: "Provider tier" }],
            }),
          ],
          modelSelection: { modelId: "composer-2.5", reasoningEffort: "medium" },
          onModelSelectionChange,
        })
        yield* Effect.promise(() => Promise.resolve())

        yield* Effect.promise(() =>
          user.click(screen.getByRole("button", { name: "Configuration" })),
        )
        yield* Effect.promise(() =>
          user.click(screen.getByRole("menuitemradio", { name: "Provider tier" })),
        )
        expect(onModelSelectionChange).toHaveBeenCalledWith({
          modelId: "composer-2.5",
          reasoningEffort: "medium",
          serviceTier: "__noyau_default_service_tier__",
        })
      }),
    ))

  it("shows the shared configuration dropdown for whichever traits a model advertises", () => {
    renderComposer({
      catalog: [
        model({ reasoningEfforts: [], thinking: { label: "Thinking", defaultValue: false } }),
      ],
      modelSelection: { modelId: "composer-2.5", serviceTier: "fast", thinking: false },
    })

    expect(screen.getByRole("button", { name: "Configuration" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Thinking" }).textContent).toContain("Off")
  })

  it("restores the caret after changing effort", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const user = userEvent.setup()
        renderComposer()
        yield* Effect.promise(() => Promise.resolve())
        const caret = "hello".length
        const field = composerField()
        setComposerPromptFieldCaret(field, caret)
        fireEvent.click(field)
        expect(composerPromptFieldCaretOffset(field)).toBe(caret)

        yield* Effect.promise(() =>
          user.click(screen.getByRole("button", { name: "Configuration" })),
        )
        yield* Effect.promise(() => user.click(screen.getByRole("menuitemradio", { name: /high/ })))

        expect(document.activeElement).toBe(composerField())
        expect(composerPromptFieldCaretOffset(composerField())).toBe(caret)
      }),
    ))
})
