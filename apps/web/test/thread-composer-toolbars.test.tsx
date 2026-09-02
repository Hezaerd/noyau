// @vitest-environment happy-dom

import type { AgentSkillEntry } from "@noyau/contracts/entities/agent-skill"
import type { CursorModel } from "@noyau/contracts/entities/environment"
import { ProviderInstanceId } from "@noyau/contracts/entities/environment"
import type { WorkspacePathEntry } from "@noyau/contracts/entities/workspace-path"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import type { ComposerToolbarOwnerDefinition } from "../src/components/thread/ComposerToolbarHost"
import { ThreadComposer } from "../src/components/thread/ThreadComposer"
import type { ComposerTicket } from "../src/lib/composer-tickets"
import { AppAtomRegistryProvider, resetAppAtomRegistryForTests } from "../src/state/atom-registry"

const model: CursorModel = {
  modelId: "composer-2.5",
  label: "Composer 2.5",
  reasoningEfforts: [],
  serviceTiers: [],
}

const ticket: ComposerTicket = {
  ticketId: "40818da4-a4de-46f6-a60f-1aa305093a6e",
  title: "Mentioner ticket dans transcript",
  columnName: "In progress",
  done: false,
}

const skill: AgentSkillEntry = {
  name: "write-docs",
  displayName: "Write docs",
  description: "Update Noyau documentation",
  scope: "repo",
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {
        return undefined
      }

      disconnect() {
        return undefined
      }
    },
  )
})

afterEach(() => {
  cleanup()
  resetAppAtomRegistryForTests()
  vi.unstubAllGlobals()
})

const renderComposer = ({
  placement = "docked",
  text = "hello",
  tickets = [],
  skills = [],
  searchPaths,
  toolbars,
  onTextChange = vi.fn(),
  onSubmit = vi.fn(),
}: {
  readonly placement?: "docked" | "hero"
  readonly text?: string
  readonly tickets?: ReadonlyArray<ComposerTicket>
  readonly skills?: ReadonlyArray<AgentSkillEntry>
  readonly searchPaths?: ((query: string) => Promise<ReadonlyArray<WorkspacePathEntry>>) | undefined
  readonly toolbars?: ReadonlyArray<ComposerToolbarOwnerDefinition> | undefined
  readonly onTextChange?: (value: string) => void
  readonly onSubmit?: () => void
} = {}) => {
  const renderTree = (nextToolbars = toolbars) => (
    <AppAtomRegistryProvider>
      <ThreadComposer
        isRunning={false}
        disabled={false}
        text={text}
        images={[]}
        runtimeMode="full-access"
        models={[model]}
        modelsByProvider={{ cursor: [model] }}
        availableProviders={[ProviderInstanceId.make("cursor")]}
        selectedProvider={ProviderInstanceId.make("cursor")}
        modelSelection={{ modelId: model.modelId }}
        defaultModelSelection={null}
        error={undefined}
        placement={placement}
        onSubmit={onSubmit}
        onTextChange={onTextChange}
        onRuntimeModeChange={vi.fn()}
        onModelSelectionChange={vi.fn()}
        onDefaultModelSelectionChange={vi.fn()}
        onPaste={vi.fn()}
        onDrop={vi.fn()}
        onImageRemove={vi.fn()}
        onInterrupt={vi.fn()}
        searchPaths={searchPaths}
        tickets={tickets}
        skills={skills}
        toolbars={nextToolbars}
      />
    </AppAtomRegistryProvider>
  )
  const result = render(renderTree())
  return {
    ...result,
    rerenderToolbars: (nextToolbars: ReadonlyArray<ComposerToolbarOwnerDefinition>) =>
      result.rerender(renderTree(nextToolbars)),
  }
}

describe("ThreadComposer toolbar composition", () => {
  it("renders an external bottom toolbar immediately after the composer shell", () => {
    renderComposer({
      toolbars: [
        {
          id: "composer-git",
          placement: "bottom",
          content: <span data-testid="git-toolbar">Git</span>,
        },
      ],
    })

    const host = screen.getByTestId("git-toolbar").closest('[data-slot="composer-toolbar-host"]')
    if (host === null) {
      throw new Error("Expected the toolbar host to render")
    }
    const shell = host.querySelector(".composer-glass-shell")
    const bottom = host.querySelector(
      '[data-slot="composer-toolbar-area"][data-placement="bottom"]',
    )

    if (shell === null || bottom === null) {
      throw new Error("Expected the shell and bottom toolbar area to render")
    }
    expect(bottom.querySelector('[data-testid="git-toolbar"]')).toBeTruthy()
    expect(shell.compareDocumentPosition(bottom) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it("registers active @ suggestions in the top area while the bottom toolbar coexists", () => {
    renderComposer({
      text: "@",
      tickets: [ticket],
      toolbars: [
        {
          id: "composer-git",
          placement: "bottom",
          content: <span data-testid="git-toolbar">Git</span>,
        },
      ],
    })

    const listbox = screen.getByRole("listbox", { name: "Composer suggestions" })
    const top = listbox.closest('[data-slot="composer-toolbar-area"][data-placement="top"]')
    const textbox = screen.getByRole("textbox", { name: "Compose a message" })

    expect(top).toBeTruthy()
    expect(screen.getByTestId("git-toolbar")).toBeTruthy()
    expect(textbox.getAttribute("aria-controls")).toBe(listbox.id)
    expect(textbox.getAttribute("aria-expanded")).toBe("true")
    expect(textbox.getAttribute("aria-activedescendant")).toBe("composer-mention-option-0")
  })

  it("registers active $ skills in the top area", () => {
    renderComposer({ text: "$", skills: [skill] })

    const listbox = screen.getByRole("listbox", { name: "Composer suggestions" })
    const top = listbox.closest('[data-slot="composer-toolbar-area"][data-placement="top"]')

    expect(top).toBeTruthy()
    expect(within(listbox).getByRole("option", { name: /Write docs/ })).toBeTruthy()
  })

  it("suppresses suggestion behavior when an external toolbar occupies the top area", () => {
    const onTextChange = vi.fn()
    const onSubmit = vi.fn()
    renderComposer({
      text: "@",
      tickets: [ticket],
      onTextChange,
      onSubmit,
      toolbars: [
        {
          id: "external-top",
          placement: "top",
          content: <span data-testid="external-top-toolbar">External</span>,
        },
      ],
    })

    expect(screen.getByTestId("external-top-toolbar")).toBeTruthy()
    expect(screen.queryByRole("listbox", { name: "Composer suggestions" })).toBeNull()
    const textbox = screen.getByRole("textbox", { name: "Compose a message" })
    expect(textbox.getAttribute("aria-expanded")).toBeNull()
    expect(textbox.getAttribute("aria-controls")).toBeNull()
    expect(textbox.getAttribute("aria-activedescendant")).toBeNull()

    fireEvent.keyDown(textbox, { key: "Enter" })
    expect(onTextChange).not.toHaveBeenCalled()
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it("preempts open suggestions when a blocking toolbar appears", () => {
    const rendered = renderComposer({ text: "@", tickets: [ticket] })
    expect(screen.getByRole("listbox", { name: "Composer suggestions" })).toBeTruthy()

    rendered.rerenderToolbars([
      {
        id: "composer-ask-question",
        placement: "top",
        priority: "blocking",
        content: <span data-testid="ask-question-toolbar">Ask</span>,
      },
    ])

    expect(screen.getByTestId("ask-question-toolbar")).toBeTruthy()
    expect(screen.queryByRole("listbox", { name: "Composer suggestions" })).toBeNull()
  })

  it("does not create empty placement regions and preserves hero/docked sizing classes", () => {
    const { container, unmount } = renderComposer()

    expect(container.querySelector('[data-slot="composer-toolbar-area"]')).toBeNull()
    expect(container.querySelector('[data-placement="bottom"]')).toBeNull()
    expect(container.querySelector("form")?.className).toContain("px-4 pb-4 sm:px-6")

    unmount()
    const hero = renderComposer({ placement: "hero" })
    expect(hero.container.querySelector("form")?.className).toBe("w-full")
  })
})
