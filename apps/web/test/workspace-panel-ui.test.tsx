// @vitest-environment happy-dom

import { ThreadId } from "@noyau/contracts/ids"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vite-plus/test"

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

    await user.click(screen.getByRole("button", { name: "Probe" }))

    expect(screen.getByRole("tab", { name: "Probe" })).toBeTruthy()
    expect(screen.getByText(/Surface /)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Probe" })).toBeNull()
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
