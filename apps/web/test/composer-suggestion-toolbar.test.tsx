// @vitest-environment happy-dom

import { cleanup, createEvent, fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"

import { ComposerSuggestionToolbar } from "../src/components/thread/ComposerSuggestionToolbar"
import type { ComposerMentionEntry } from "../src/lib/composer-tickets"
import { AppAtomRegistryProvider, resetAppAtomRegistryForTests } from "../src/state/atom-registry"

const ticket = (
  overrides?: Partial<Extract<ComposerMentionEntry, { kind: "ticket" }>>,
): ComposerMentionEntry => ({
  kind: "ticket",
  ticketId: "40818da4-a4de-46f6-a60f-1aa305093a6e",
  title: "Mentioner ticket dans transcript",
  columnName: "In progress",
  done: false,
  ...overrides,
})

const file = (
  overrides?: Partial<Extract<ComposerMentionEntry, { kind: "file" }>>,
): ComposerMentionEntry => ({
  kind: "file",
  path: "src/adapter.ts",
  entryKind: "file",
  ...overrides,
})

const skill: ComposerMentionEntry = {
  kind: "skill",
  name: "write-docs",
  displayName: "Write docs",
  description: "Update Noyau documentation",
  scope: "repo",
}

const renderToolbar = ({
  entries = [ticket(), file()],
  highlightedIndex = 0,
  loading = false,
  onHighlight = vi.fn(),
  onSelect = vi.fn(),
  id = "composer-suggestions",
}: {
  readonly entries?: ReadonlyArray<ComposerMentionEntry>
  readonly highlightedIndex?: number
  readonly loading?: boolean
  readonly onHighlight?: (index: number) => void
  readonly onSelect?: (entry: ComposerMentionEntry) => void
  readonly id?: string
} = {}) =>
  render(
    <AppAtomRegistryProvider>
      <ComposerSuggestionToolbar
        entries={entries}
        highlightedIndex={highlightedIndex}
        id={id}
        loading={loading}
        onHighlight={onHighlight}
        onSelect={onSelect}
      />
    </AppAtomRegistryProvider>,
  )

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

describe("ComposerSuggestionToolbar", () => {
  it("keeps the listbox and option accessibility contract", () => {
    renderToolbar({ highlightedIndex: 1 })

    const listbox = screen.getByRole("listbox", { name: "Composer suggestions" })
    expect(listbox.getAttribute("id")).toBe("composer-suggestions")
    expect(within(listbox).getAllByRole("option")).toHaveLength(2)
    expect(within(listbox).getAllByRole("option")[0]?.getAttribute("aria-selected")).toBe("false")
    expect(within(listbox).getAllByRole("option")[1]?.getAttribute("aria-selected")).toBe("true")
  })

  it("renders Ticket and File headings while preserving supplied ordering", () => {
    const entries = [
      ticket({ title: "First ticket" }),
      ticket({ ticketId: "26bdc169-4894-41cb-9f46-3624f6810916", title: "Second ticket" }),
      file({ path: "AGENTS.md" }),
      file({ path: "src/index.ts" }),
    ]
    renderToolbar({ entries })

    const listbox = screen.getByRole("listbox")
    expect(within(listbox).getByText("Tickets")).toBeTruthy()
    expect(within(listbox).getByText("Files")).toBeTruthy()
    expect(
      within(listbox)
        .getAllByRole("option")
        .map((option) => option.id),
    ).toEqual([
      "composer-mention-option-0",
      "composer-mention-option-1",
      "composer-mention-option-2",
      "composer-mention-option-3",
    ])
    expect(
      within(listbox)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["First ticketIn progress", "Second ticketIn progress", "AGENTS.md", "index.tssrc"])
  })

  it("renders skills with their display name and description", () => {
    renderToolbar({ entries: [skill] })

    const listbox = screen.getByRole("listbox")
    expect(within(listbox).getByText("Skills")).toBeTruthy()
    expect(
      within(listbox).getByRole("option", { name: /Write docs.*Update Noyau documentation/ }),
    ).toBeTruthy()
  })

  it("calls the selection callback for the chosen entry", async () => {
    const onSelect = vi.fn()
    const entries = [ticket(), file()]
    renderToolbar({ entries, onSelect })

    await userEvent.setup().click(screen.getByRole("option", { name: /adapter\.ts/ }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(entries[1])
  })

  it("prevents option mousedown from stealing composer focus", () => {
    renderToolbar()

    const option = screen.getAllByRole("option")[0]
    if (option === undefined) {
      throw new Error("Expected a suggestion option")
    }
    const event = createEvent.mouseDown(option)
    fireEvent(option, event)

    expect(event.defaultPrevented).toBe(true)
  })

  it("shows the loading state without options", () => {
    renderToolbar({ entries: [], loading: true })

    const listbox = screen.getByRole("listbox")
    expect(within(listbox).getByText("Searching…")).toBeTruthy()
    expect(within(listbox).queryAllByRole("option")).toHaveLength(0)
  })

  it("shows the empty state without options", () => {
    renderToolbar({ entries: [] })

    const listbox = screen.getByRole("listbox")
    expect(within(listbox).getByText("No results")).toBeTruthy()
    expect(within(listbox).queryAllByRole("option")).toHaveLength(0)
  })

  it("keeps option ids stable when the same entries rerender", () => {
    const entries = [ticket(), file()]
    const { rerender } = renderToolbar({ entries })

    const renderSameToolbar = () =>
      rerender(
        <AppAtomRegistryProvider>
          <ComposerSuggestionToolbar
            entries={entries}
            highlightedIndex={0}
            id="composer-suggestions"
            loading={false}
            onHighlight={vi.fn()}
            onSelect={vi.fn()}
          />
        </AppAtomRegistryProvider>,
      )
    const firstIds = screen.getAllByRole("option").map((option) => option.id)
    renderSameToolbar()
    const secondIds = screen.getAllByRole("option").map((option) => option.id)

    expect(secondIds).toEqual(firstIds)
  })
})
