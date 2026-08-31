// @vitest-environment happy-dom

import { WorkspaceRoot } from "@noyau/contracts/entities/environment"
import { ProjectId, ThreadId } from "@noyau/contracts/ids"
import {
  ShellSnapshot,
  ThreadShell,
  type ThreadShell as ThreadShellType,
} from "@noyau/contracts/shell"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Schema } from "effect"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { ThreadSidebarItem } from "../src/components/sidebar/ThreadSidebarItem"
import { SidebarProvider } from "../src/components/ui/sidebar"
import { AppAtomRegistryProvider, resetAppAtomRegistryForTests } from "../src/state/atom-registry"
import { replaceAppliedShell, resetAppliedShell } from "../src/state/shell"
import { setThreadPinned } from "../src/state/thread-pins"
import { encodedTestEnvironment } from "./encoded-environment"

const prefetchThreadSnapshot = vi.hoisted(() => vi.fn())
const dispatchThreadSettle = vi.hoisted(() => vi.fn())
const dispatchThreadTitleRegenerate = vi.hoisted(() => vi.fn())

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    onPointerEnter,
    onFocus,
    onClick,
  }: {
    readonly children?: ReactNode
    readonly onPointerEnter?: () => void
    readonly onFocus?: () => void
    readonly onClick?: () => void
  }) => (
    <a href="#thread" onPointerEnter={onPointerEnter} onFocus={onFocus} onClick={onClick}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}))

vi.mock("../src/lib/thread-snapshot-prefetch", () => ({
  prefetchThreadSnapshot,
}))

vi.mock("../src/lib/thread-settle-actions", () => ({
  dispatchThreadSettle,
}))

vi.mock("../src/lib/thread-title-actions", () => ({
  dispatchThreadTitleRegenerate,
}))

afterEach(() => {
  cleanup()
  resetAppAtomRegistryForTests()
  resetAppliedShell()
  prefetchThreadSnapshot.mockClear()
  dispatchThreadSettle.mockClear()
  dispatchThreadTitleRegenerate.mockClear()
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
  listedAt: "2026-08-20T00:00:00.000Z",
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
    const project = link.querySelector("[data-slot='thread-sidebar-project']")
    const lastActivity = link.querySelector("[data-slot='thread-sidebar-last-activity']")
    const pin = screen.getByLabelText("Pinned")
    expect(activity).not.toBeNull()
    expect(project).not.toBeNull()
    expect(project?.textContent).toBe("noyau")
    expect(lastActivity).not.toBeNull()
    expect(activity?.contains(project)).toBe(true)
    expect(activity?.contains(pin)).toBe(true)
    expect(activity?.contains(lastActivity)).toBe(true)
    expect(pin.compareDocumentPosition(lastActivity!) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(activity?.nextElementSibling?.textContent).toBe("Stores Zustand t3code vs shell")
    expect(lastActivity?.querySelector("[aria-hidden='true']")).toBeNull()
    expect(lastActivity?.textContent).toMatch(/^Last activity: /)
  })

  it("replaces the elapsed timer with status and keeps the pin on its left", () => {
    const working = Schema.decodeSync(ThreadShell)({
      id: threadId,
      projectId,
      title: "Stores Zustand t3code vs shell",
      provider: "cursor",
      modelSelection: null,
      runtimeMode: "full-access",
      status: "active",
      latestTurn: {
        turnId: "30000000-0000-4000-8000-000000000001",
        state: "running",
        requestedAt: "2026-08-25T11:00:00.000Z",
        startedAt: "2026-08-25T11:00:00.000Z",
        completedAt: null,
      },
      sessionStatus: "running",
      lastError: null,
      createdAt: "2026-08-20T00:00:00.000Z",
      listedAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-25T11:05:00.000Z",
    })
    replaceAppliedShell({
      ...Schema.decodeSync(ShellSnapshot)({
        snapshotSequence: 1,
        environment: encodedTestEnvironment(),
        projects: [
          {
            id: projectId,
            name: "noyau",
            workspaceRoot: "/tmp/noyau",
            defaultModelSelection: null,
            available: true,
            createdAt: "2026-08-25T12:00:00.000Z",
            updatedAt: "2026-08-25T12:00:00.000Z",
          },
        ],
        threads: [],
      }),
      threads: [working],
    })
    setThreadPinned(threadId, true)
    render(
      <AppAtomRegistryProvider>
        <SidebarProvider>
          <ThreadSidebarItem
            thread={working}
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
    const status = screen.getByRole("status")
    const pin = screen.getByLabelText("Pinned")
    expect(link.querySelector("[data-slot='thread-sidebar-last-activity']")).toBeNull()
    expect(link.querySelector("[data-slot='thread-sidebar-project']")?.contains(status)).toBe(false)
    expect(pin.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(status.textContent).toMatch(/In progress/)
    expect(screen.queryByRole("button", { name: "Settle Thread" })).toBeNull()
  })

  it("prefetches a cold Thread on pointer enter, not the open one", () => {
    const renderItem = (isActive: boolean) =>
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
              isActive={isActive}
              settled={false}
              onSelect={vi.fn()}
            />
          </SidebarProvider>
        </AppAtomRegistryProvider>,
      )

    renderItem(false)
    fireEvent.pointerEnter(screen.getByRole("link", { name: /Stores Zustand t3code vs shell/ }))
    expect(prefetchThreadSnapshot).toHaveBeenCalledWith(threadId)

    prefetchThreadSnapshot.mockClear()
    cleanup()
    renderItem(true)
    fireEvent.pointerEnter(screen.getByRole("link", { name: /Stores Zustand t3code vs shell/ }))
    expect(prefetchThreadSnapshot).not.toHaveBeenCalled()
  })

  it("swaps last activity for Settle on a settleable Thread and does not open it", () => {
    const onSelect = vi.fn()
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
            onSelect={onSelect}
          />
        </SidebarProvider>
      </AppAtomRegistryProvider>,
    )

    const settle = screen.getByRole("button", { name: "Settle Thread" })
    const lastActivity = screen
      .getByRole("link", { name: /Stores Zustand t3code vs shell/ })
      .querySelector("[data-slot='thread-sidebar-last-activity']")
    expect(lastActivity).not.toBeNull()
    expect(settle.compareDocumentPosition(lastActivity!) & Node.DOCUMENT_POSITION_PRECEDING).toBe(
      Node.DOCUMENT_POSITION_PRECEDING,
    )

    fireEvent.click(settle)
    expect(dispatchThreadSettle).toHaveBeenCalledWith(thread, true)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it("offers Unsettle on a settled Thread", () => {
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
            settled={true}
            onSelect={vi.fn()}
          />
        </SidebarProvider>
      </AppAtomRegistryProvider>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Unsettle Thread" }))
    expect(dispatchThreadSettle).toHaveBeenCalledWith(thread, false)
  })

  it("settles from the context menu", async () => {
    const user = userEvent.setup()
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

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("link", { name: /Stores Zustand t3code vs shell/ }),
    })
    await user.click(screen.getByRole("menuitem", { name: /Settle/ }))
    expect(dispatchThreadSettle).toHaveBeenCalledWith(thread, true)
  })

  it("shows F2 on Rename and regenerates the title from the session", async () => {
    const user = userEvent.setup()
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

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("link", { name: /Stores Zustand t3code vs shell/ }),
    })
    expect(screen.getByRole("menuitem", { name: /Rename/ }).textContent).toMatch(/F2/)
    await user.click(screen.getByRole("menuitem", { name: /Regenerate title/ }))
    expect(dispatchThreadTitleRegenerate).toHaveBeenCalledWith(threadId)
  })

  it("does not offer title regeneration before the first Turn", async () => {
    const user = userEvent.setup()
    const empty = Schema.decodeSync(ThreadShell)({
      id: threadId,
      projectId,
      title: "Stores Zustand t3code vs shell",
      provider: "cursor",
      modelSelection: null,
      runtimeMode: "full-access",
      status: "active",
      latestTurn: null,
      sessionStatus: "ready",
      lastError: null,
      createdAt: "2026-08-20T00:00:00.000Z",
      listedAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-25T11:05:00.000Z",
    })
    render(
      <AppAtomRegistryProvider>
        <SidebarProvider>
          <ThreadSidebarItem
            thread={empty}
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

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("link", { name: /Stores Zustand t3code vs shell/ }),
    })
    expect(
      screen.getByRole("menuitem", { name: /Regenerate title/ }).getAttribute("aria-disabled"),
    ).toBe("true")
  })
})
