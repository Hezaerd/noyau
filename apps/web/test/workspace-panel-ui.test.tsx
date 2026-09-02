// @vitest-environment happy-dom

import { ThreadId } from "@noyau/contracts/ids"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"

import { defineWorkspaceTab } from "../src/components/workspace-panel/define-workspace-tab"
import type { WorkspaceTabRenderContext } from "../src/components/workspace-panel/define-workspace-tab"
import { WorkspacePanel } from "../src/components/workspace-panel/WorkspacePanel"
import { AppAtomRegistryProvider, resetAppAtomRegistryForTests } from "../src/state/atom-registry"
import { openWorkspaceTab, setWorkspacePanelOpen } from "../src/state/workspace-panel"

const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")

const probe = defineWorkspaceTab({
  kind: "probe",
  label: "Probe",
  create: (tabId: string) => ({ tabId }),
  icon: () => <span>P</span>,
  render: ({ tab }: WorkspaceTabRenderContext) => <p>Surface {tab.id}</p>,
})

afterEach(() => {
  cleanup()
  resetAppAtomRegistryForTests()
})

describe("WorkspacePanel", () => {
  it("opens a real surface from the launcher without a placeholder tab", async () => {
    const user = userEvent.setup()
    setWorkspacePanelOpen(threadId, true)
    render(
      <AppAtomRegistryProvider>
        <WorkspacePanel kinds={[probe]} threadId={threadId} />
      </AppAtomRegistryProvider>,
    )

    expect(screen.queryByRole("button", { name: "Add workspace tab" })).toBeNull()
    await user.click(screen.getByRole("button", { name: "Probe" }))

    expect(screen.getByRole("tab", { name: "Probe" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Add workspace tab" })).toBeTruthy()
    expect(screen.getByText(/Surface /)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Probe" })).toBeNull()
  })

  it("places the add menu after the rightmost tab and gives its popup a glass surface", async () => {
    const user = userEvent.setup()
    openWorkspaceTab(threadId, probe)
    openWorkspaceTab(threadId, probe)
    setWorkspacePanelOpen(threadId, true)
    render(
      <AppAtomRegistryProvider>
        <WorkspacePanel kinds={[probe]} threadId={threadId} />
      </AppAtomRegistryProvider>,
    )

    const tabs = screen.getAllByRole("tab", { name: "Probe" })
    const add = screen.getByRole("button", { name: "Add workspace tab" })
    expect(tabs.at(-1)?.closest("[data-slot='workspace-panel-tab']")?.nextElementSibling).toBe(add)

    await user.click(add)
    expect(document.querySelector("[data-slot='menu-popup']")?.className).toContain(
      "surface-overlay",
    )
  })

  it("can host two instances of the same kind", () => {
    openWorkspaceTab(threadId, probe)
    openWorkspaceTab(threadId, probe)
    setWorkspacePanelOpen(threadId, true)
    render(
      <AppAtomRegistryProvider>
        <WorkspacePanel kinds={[probe]} threadId={threadId} />
      </AppAtomRegistryProvider>,
    )

    expect(screen.getAllByRole("tab", { name: "Probe" })).toHaveLength(2)
  })
})
