// @vitest-environment happy-dom

import type { CursorModel } from "@noyau/contracts/entities/environment"
import { ProviderInstanceId } from "@noyau/contracts/entities/environment"
import type { ModelSelection } from "@noyau/contracts/entities/model-selection"
import type { RuntimeMode } from "@noyau/contracts/entities/runtime-mode"
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

const model = (modelId: string, label: string): CursorModel => ({
  modelId,
  label,
  reasoningEfforts: [],
  serviceTiers: [],
})

const models = [model("composer-2.5", "Composer 2.5"), model("grok-4.6", "Grok 4.6")]

const renderComposer = ({
  onModelSelectionChange = vi.fn(),
  onRuntimeModeChange = vi.fn(),
}: {
  readonly onModelSelectionChange?: (selection: ModelSelection | null) => void
  readonly onRuntimeModeChange?: (mode: RuntimeMode) => void
} = {}) =>
  render(
    <AppAtomRegistryProvider>
      <ThreadComposer
        isRunning={false}
        disabled={false}
        text="hello world"
        images={[]}
        runtimeMode="full-access"
        models={models}
        modelsByProvider={{ cursor: models }}
        availableProviders={[ProviderInstanceId.make("cursor")]}
        selectedProvider={ProviderInstanceId.make("cursor")}
        modelSelection={{ modelId: "composer-2.5" }}
        defaultModelSelection={null}
        error={undefined}
        onSubmit={vi.fn()}
        onTextChange={vi.fn()}
        onRuntimeModeChange={onRuntimeModeChange}
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

const placeCaret = (offset: number) => {
  const field = composerField()
  setComposerPromptFieldCaret(field, offset)
  fireEvent.click(field)
  expect(composerPromptFieldCaretOffset(field)).toBe(offset)
}

const expectCaretRestored = (offset: number) => {
  expect(document.activeElement).toBe(composerField())
  expect(composerPromptFieldCaretOffset(composerField())).toBe(offset)
}

describe("thread composer caret", () => {
  it("restores the caret after changing the model", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const user = userEvent.setup()
        const onModelSelectionChange = vi.fn()
        renderComposer({ onModelSelectionChange })
        yield* Effect.promise(() => Promise.resolve())
        const caret = "hello".length
        placeCaret(caret)

        yield* Effect.promise(() => user.click(screen.getByRole("button", { name: /Model / })))
        yield* Effect.promise(() => user.click(screen.getByText("Grok 4.6")))

        expect(onModelSelectionChange).toHaveBeenCalledWith({ modelId: "grok-4.6" })
        expectCaretRestored(caret)
      }),
    ))

  it("restores the caret after dismissing the model picker", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const user = userEvent.setup()
        renderComposer()
        yield* Effect.promise(() => Promise.resolve())
        const caret = "hello".length
        placeCaret(caret)

        yield* Effect.promise(() => user.click(screen.getByRole("button", { name: /Model / })))
        expect(screen.getByLabelText("Search a model")).toBeTruthy()
        yield* Effect.promise(() => user.keyboard("{Escape}"))

        expectCaretRestored(caret)
      }),
    ))

  it("restores the caret after changing the access level", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const user = userEvent.setup()
        const onRuntimeModeChange = vi.fn()
        renderComposer({ onRuntimeModeChange })
        yield* Effect.promise(() => Promise.resolve())
        const caret = "hello".length
        placeCaret(caret)

        yield* Effect.promise(() =>
          user.click(screen.getByRole("button", { name: "Access level" })),
        )
        yield* Effect.promise(() => user.click(screen.getByRole("menuitemradio", { name: /Auto/ })))

        expect(onRuntimeModeChange).toHaveBeenCalled()
        expectCaretRestored(caret)
      }),
    ))
})
