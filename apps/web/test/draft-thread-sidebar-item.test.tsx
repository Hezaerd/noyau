// @vitest-environment happy-dom

import { ProjectId } from "@noyau/contracts/ids"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DraftThreadSidebarItem } from "../src/components/sidebar/DraftThreadSidebarItem"
import { SidebarProvider } from "../src/components/ui/sidebar"
import { AppAtomRegistryProvider, resetAppAtomRegistryForTests } from "../src/state/atom-registry"
import {
  readComposerDraft,
  resetComposerDrafts,
  writeComposerDraft,
} from "../src/state/composer-drafts"

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    onClick,
  }: {
    readonly children?: ReactNode
    readonly onClick?: () => void
  }) => (
    <a href="#new-thread" onClick={onClick}>
      {children}
    </a>
  ),
}))

afterEach(() => {
  cleanup()
  resetComposerDrafts()
  resetAppAtomRegistryForTests()
})

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const draftA = "30000000-0000-4000-8000-000000000001"
const draftB = "30000000-0000-4000-8000-000000000002"

describe("DraftThreadSidebarItem", () => {
  it("discards the unsaved /thread/new Brouillon", async () => {
    writeComposerDraft(projectId, undefined, "Fix the sidebar draft", draftA)
    writeComposerDraft(projectId, undefined, "Keep this draft", draftB)
    const user = userEvent.setup()
    render(
      <AppAtomRegistryProvider>
        <SidebarProvider>
          <DraftThreadSidebarItem
            project={{ id: projectId, name: "Noyau" }}
            draftId={draftA}
            title="Fix the sidebar draft"
            isActive
            onSelect={vi.fn()}
          />
        </SidebarProvider>
      </AppAtomRegistryProvider>,
    )

    await user.pointer({ keys: "[MouseRight]", target: screen.getByText("Fix the sidebar draft") })
    await user.click(screen.getByRole("menuitem", { name: "Discard" }))
    await user.click(screen.getByRole("button", { name: "Discard" }))

    expect(readComposerDraft(projectId, undefined, draftA)).toBe("")
    expect(readComposerDraft(projectId, undefined, draftB)).toBe("Keep this draft")
  })
})
