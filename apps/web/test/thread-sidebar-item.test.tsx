// @vitest-environment happy-dom

import { WorkspaceRoot } from "@noyau/protocol/entities/environment"
import { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { ThreadShell, type ThreadShell as ThreadShellType } from "@noyau/protocol/shell"
import { cleanup, render, screen } from "@testing-library/react"
import { Schema } from "effect"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { ThreadSidebarItem } from "../src/components/sidebar/ThreadSidebarItem"
import { SidebarProvider } from "../src/components/ui/sidebar"
import { AppAtomRegistryProvider, resetAppAtomRegistryForTests } from "../src/state/atom-registry"
import { setThreadPinned } from "../src/state/thread-pins"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { readonly children?: ReactNode }) => <a href="#thread">{children}</a>,
  useNavigate: () => vi.fn(),
}))

afterEach(() => {
  cleanup()
  resetAppAtomRegistryForTests()
})

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const workspaceRoot = Schema.decodeSync(WorkspaceRoot)("/tmp/noyau")

const thread = Schema.decodeSync(ThreadShell)({
  id: threadId,
  projectId,
  title: "Stores Zustand t3code vs shell",
  provider: "cursor",
  modelSelection: null,
  runtimeMode: "full-access",
  status: "active",
  latestTurn: {
    turnId: "30000000-0000-4000-8000-000000000001",
    state: "completed",
    requestedAt: "2026-08-25T11:00:00.000Z",
    startedAt: "2026-08-25T11:00:00.000Z",
    completedAt: "2026-08-25T11:05:00.000Z",
  },
  sessionStatus: "ready",
  lastError: null,
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-25T11:05:00.000Z",
}) satisfies ThreadShellType

describe("ThreadSidebarItem", () => {
  it("puts the title between the activity row and checkout, pin left of the timer", () => {
    setThreadPinned(threadId, true)
    render(
      <AppAtomRegistryProvider>
        <SidebarProvider>
          <ThreadSidebarItem
            thread={thread}
            project={{
              id: projectId,
              name: "noyau",
              workspaceRoot,
            }}
            pullRequest={null}
            liveBranch={null}
            isActive={false}
            settled={false}
            onSelect={vi.fn()}
          />
        </SidebarProvider>
      </AppAtomRegistryProvider>,
    )

    const link = screen.getByRole("link", { name: /Stores Zustand t3code vs shell/ })
    const activity = link.querySelector("[data-slot='thread-sidebar-activity']")
    const lastActivity = link.querySelector("[data-slot='thread-sidebar-last-activity']")
    const pin = screen.getByLabelText("Épinglé")
    expect(activity).not.toBeNull()
    expect(lastActivity).not.toBeNull()
    expect(activity?.contains(pin)).toBe(true)
    expect(activity?.contains(lastActivity)).toBe(true)
    expect(pin.compareDocumentPosition(lastActivity!) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(activity?.nextElementSibling?.textContent).toBe("Stores Zustand t3code vs shell")
    expect(lastActivity?.querySelector("[aria-hidden='true']")).toBeNull()
    expect(lastActivity?.textContent).toMatch(/^Dernière activité : /)
  })
})
