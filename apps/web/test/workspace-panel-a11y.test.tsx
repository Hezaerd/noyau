// @vitest-environment happy-dom

import { ThreadId } from "@noyau/contracts/ids"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  defineWorkspaceTab,
  type WorkspaceTabRenderContext,
} from "../src/components/workspace-panel/define-workspace-tab"
import { WorkspacePanel } from "../src/components/workspace-panel/WorkspacePanel"
import {
  clampWorkspacePanelWidth,
  maxWorkspacePanelWidth,
  minWorkspacePanelWidth,
} from "../src/lib/workspace-panel-persist"
import { AppAtomRegistryProvider, resetAppAtomRegistryForTests } from "../src/state/atom-registry"
import {
  getWorkspacePanel,
  openWorkspaceTab,
  setWorkspacePanelOpen,
} from "../src/state/workspace-panel"

const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")

type TestPayload = { readonly value: string }

const testTab = defineWorkspaceTab<"test", TestPayload>({
  kind: "test",
  label: "Test tab",
  create: () => ({ value: "test" }),
  icon: () => <span aria-hidden="true">T</span>,
  render: ({ tab }: WorkspaceTabRenderContext<"test", TestPayload>) => (
    <div>Content for {tab.id}</div>
  ),
})

const renderPanel = () => {
  setWorkspacePanelOpen(threadId, true)
  return render(
    <AppAtomRegistryProvider>
      <WorkspacePanel threadId={threadId} kinds={[testTab]} />
    </AppAtomRegistryProvider>,
  )
}

beforeEach(() => {
  window.innerWidth = 1024
})

afterEach(() => {
  cleanup()
  resetAppAtomRegistryForTests()
})

describe("workspace panel accessibility", () => {
  it("associates tabs with tabpanels and exposes a keyboard tab flow", async () => {
    const user = userEvent.setup()
    openWorkspaceTab(threadId, testTab)
    openWorkspaceTab(threadId, testTab)
    renderPanel()

    const tabs = screen.getAllByRole("tab")
    expect(screen.getByRole("tablist", { name: "Workspace panel tabs" })).toBeTruthy()
    expect(tabs).toHaveLength(2)
    for (const tab of tabs) {
      const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "")
      expect(panel).toBeTruthy()
      expect(panel?.getAttribute("aria-labelledby")).toBe(tab.id)
      expect(panel?.getAttribute("role")).toBe("tabpanel")
    }
    expect(tabs[0]?.getAttribute("tabindex")).toBe("-1")
    expect(tabs[1]?.getAttribute("tabindex")).toBe("0")

    await user.click(tabs[0])
    await user.keyboard("{ArrowRight}")

    expect(tabs[1]?.getAttribute("aria-selected")).toBe("true")
    expect(document.activeElement).toBe(tabs[1])
  })

  it("keeps tab close actions discoverable to keyboard and coarse-pointer users", () => {
    openWorkspaceTab(threadId, testTab)
    renderPanel()

    const close = screen.getByRole("button", { name: "Close Test tab" })
    expect(close.getAttribute("data-slot")).toBe("button")
    expect(close.className).toContain("group-focus-within:opacity-100")
    expect(close.className).toContain("pointer-coarse:opacity-100")
    expect(close.className).toContain("size-7")
  })

  it("resizes the panel from the keyboard within the announced bounds", () => {
    openWorkspaceTab(threadId, testTab)
    renderPanel()

    const separator = screen.getByRole("separator", { name: "Resize workspace panel" })
    expect(separator.getAttribute("tabindex")).toBe("0")
    expect(separator.getAttribute("aria-valuemin")).toBe("320")
    expect(separator.getAttribute("aria-valuemax")).toBe("614")
    expect(separator.getAttribute("aria-valuenow")).toBe("448")

    fireEvent.keyDown(separator, { key: "ArrowLeft" })
    expect(getWorkspacePanel(threadId)).toBeDefined()
    expect(separator.getAttribute("aria-valuenow")).toBe("464")

    fireEvent.keyDown(separator, { key: "Home" })
    expect(separator.getAttribute("aria-valuenow")).toBe("320")
    fireEvent.keyDown(separator, { key: "End" })
    expect(separator.getAttribute("aria-valuenow")).toBe("614")
  })

  it("caps the panel at the viewport width below the configured minimum", () => {
    window.innerWidth = 375
    expect(maxWorkspacePanelWidth(window.innerWidth)).toBe(225)
    expect(minWorkspacePanelWidth(window.innerWidth)).toBe(225)
    expect(clampWorkspacePanelWidth(320, window.innerWidth)).toBe(225)

    openWorkspaceTab(threadId, testTab)
    renderPanel()

    const separator = screen.getByRole("separator", { name: "Resize workspace panel" })
    expect(separator.getAttribute("aria-valuemin")).toBe("225")
    expect(separator.getAttribute("aria-valuemax")).toBe("225")
    expect(separator.getAttribute("aria-valuenow")).toBe("225")

    fireEvent.keyDown(separator, { key: "Home" })
    expect(separator.getAttribute("aria-valuenow")).toBe("225")
  })
})
