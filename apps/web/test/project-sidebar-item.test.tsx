// @vitest-environment happy-dom

import { ProjectId } from "@noyau/contracts/ids"
import { ProjectShell } from "@noyau/contracts/shell"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Schema } from "effect"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { ProjectSidebarItem } from "../src/components/sidebar/ProjectSidebarItem"
import { SidebarProvider } from "../src/components/ui/sidebar"

const createDraftThread = vi.hoisted(() => vi.fn())

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    onClick,
  }: {
    readonly children?: ReactNode
    readonly to?: string
    readonly onClick?: () => void
  }) => (
    <a href={to} onClick={onClick}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}))

vi.mock("@/hooks/use-create-draft-thread", () => ({
  useCreateDraftThread: () => createDraftThread,
}))

vi.mock("@/hooks/use-keybindings", () => ({
  useKeybinding: () => "mod+n",
}))

vi.mock("@/hooks/use-control-plane", () => ({
  useProjectThreads: () => [],
}))

vi.mock("@/hooks/use-thread-change-requests", () => ({
  useThreadChangeRequests: () => ({
    pullRequests: new Map(),
    liveBranches: new Map(),
  }),
}))

vi.mock("@/hooks/use-auto-settle-merged-threads", () => ({
  useAutoSettleMergedThreads: () => undefined,
}))

afterEach(() => {
  cleanup()
  createDraftThread.mockClear()
})

const project = Schema.decodeSync(ProjectShell)({
  id: ProjectId.make("10000000-0000-4000-8000-000000000001"),
  name: "Noyau",
  workspaceRoot: "/workspace/noyau",
  defaultModelSelection: null,
  available: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
})

describe("ProjectSidebarItem", () => {
  it("places New Agent above Board and starts a draft Thread", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <SidebarProvider>
        <ProjectSidebarItem
          project={project}
          pathname={`/projects/${project.id}/board`}
          onSelect={onSelect}
        />
      </SidebarProvider>,
    )

    const newAgent = screen.getByRole("button", { name: "New Agent" })
    const board = screen.getByRole("link", { name: "Board" })
    expect(newAgent.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )

    await user.click(newAgent)
    expect(onSelect).toHaveBeenCalledOnce()
    expect(createDraftThread).toHaveBeenCalledWith(project)
  })
})
