// @vitest-environment happy-dom

import { WorkspaceRoot } from "@noyau/protocol/entities/environment"
import { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { ThreadShell, type ThreadShell as ThreadShellType } from "@noyau/protocol/shell"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Schema } from "effect"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { ThreadArchiveConfirmDialog } from "../src/components/sidebar/ThreadArchiveConfirmDialog"
import { ThreadSidebarItem } from "../src/components/sidebar/ThreadSidebarItem"
import { SidebarProvider } from "../src/components/ui/sidebar"

const buildAndDispatchCommand = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ details: undefined, ok: true as const, value: undefined })),
)

vi.mock("@/lib/control-plane", () => ({
  buildAndDispatchCommand,
}))

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { readonly children?: ReactNode }) => <a href="#thread">{children}</a>,
  useNavigate: () => vi.fn(),
}))

Object.defineProperty(HTMLElement.prototype, "getAnimations", {
  configurable: true,
  value: () => [],
})

afterEach(() => {
  cleanup()
  buildAndDispatchCommand.mockClear()
})

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const threadTitle = "Corriger la reprise"

const thread = Schema.decodeSync(ThreadShell)({
  id: threadId,
  projectId,
  title: threadTitle,
  provider: "cursor",
  runtimeMode: "full-access",
  status: "active",
  latestTurn: null,
  sessionStatus: null,
  lastError: null,
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
}) satisfies ThreadShellType

describe("thread archive confirmation", () => {
  it("does not archive until the confirmation is accepted", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <ThreadArchiveConfirmDialog
        open
        threadTitle={threadTitle}
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    expect(screen.getByRole("alertdialog")).toBeTruthy()
    expect(screen.getByText(/quittera la sidebar/)).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Annuler" }))
    expect(onConfirm).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Archiver" }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it("opens the confirmation from the sidebar before archiving", async () => {
    const user = userEvent.setup()
    render(
      <SidebarProvider>
        <ThreadSidebarItem
          thread={thread}
          project={{
            id: projectId,
            name: "noyau",
            workspaceRoot: Schema.decodeSync(WorkspaceRoot)("/tmp/noyau"),
          }}
          isActive={false}
          onSelect={vi.fn()}
        />
      </SidebarProvider>,
    )

    expect(screen.queryByRole("alertdialog")).toBeNull()
    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("link", { name: threadTitle }),
    })
    await user.click(await screen.findByRole("menuitem", { name: "Archiver" }))

    const confirmation = await waitFor(() => screen.getByRole("alertdialog"))
    expect(confirmation).toBeTruthy()
    expect(buildAndDispatchCommand).not.toHaveBeenCalled()

    await user.click(within(confirmation).getByRole("button", { name: "Annuler" }))
    expect(buildAndDispatchCommand).not.toHaveBeenCalled()

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("link", { name: threadTitle }),
    })
    await user.click(await screen.findByRole("menuitem", { name: "Archiver" }))
    await user.click(
      within(await waitFor(() => screen.getByRole("alertdialog"))).getByRole("button", {
        name: "Archiver",
      }),
    )
    await waitFor(() => {
      expect(buildAndDispatchCommand).toHaveBeenCalledTimes(1)
    })
  })
})
