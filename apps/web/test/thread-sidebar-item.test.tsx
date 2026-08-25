// @vitest-environment happy-dom

import { WorkspaceRoot } from "@noyau/protocol/entities/environment"
import { ProjectId, ThreadId, TurnId } from "@noyau/protocol/ids"
import { ThreadShell, type ThreadShell as ThreadShellType } from "@noyau/protocol/shell"
import { cleanup, render, screen } from "@testing-library/react"
import { Schema } from "effect"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { ThreadSidebarItem } from "../src/components/sidebar/ThreadSidebarItem"
import { SidebarProvider } from "../src/components/ui/sidebar"
import { TooltipProvider } from "../src/components/ui/tooltip"

vi.mock("@/lib/control-plane", () => ({
  buildAndDispatchCommand: vi.fn(() =>
    Promise.resolve({ details: undefined, ok: true as const, value: undefined }),
  ),
}))

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    ...props
  }: {
    readonly children?: ReactNode
    readonly "aria-label"?: string
  }) => (
    <a href="#thread" {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}))

Object.defineProperty(HTMLElement.prototype, "getAnimations", {
  configurable: true,
  value: () => [],
})

afterEach(() => {
  cleanup()
})

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const workspaceRoot = Schema.decodeSync(WorkspaceRoot)("/tmp/noyau")

const makeThread = (patch: Partial<typeof ThreadShell.Encoded> = {}): ThreadShellType =>
  Schema.decodeSync(ThreadShell)({
    id: threadId,
    projectId,
    title: "Align worktree checkout",
    provider: "cursor",
    runtimeMode: "full-access",
    status: "active",
    latestTurn: null,
    sessionStatus: null,
    lastError: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    ...patch,
  })

const pullRequest = {
  number: 213,
  title: "Align worktree checkout",
  url: "https://github.com/hezaerd/noyau/pull/213",
  baseRef: "main",
  headRef: "feat/worktree-checkout",
  state: "open" as const,
  mergeability: "unknown" as const,
  ciStatus: "none" as const,
  failedChecks: [],
}

const renderItem = (
  thread: ThreadShellType,
  pr: typeof pullRequest | null = null,
  liveBranch: string | null = null,
) =>
  render(
    <TooltipProvider>
      <SidebarProvider>
        <ThreadSidebarItem
          thread={thread}
          project={{
            id: projectId,
            name: "noyau",
            workspaceRoot,
          }}
          pullRequest={pr}
          liveBranch={liveBranch}
          isActive={false}
          settled={false}
          onSelect={vi.fn()}
        />
      </SidebarProvider>
    </TooltipProvider>,
  )

describe("thread sidebar item layout", () => {
  it("keeps title, status, branch and PR on separate slots", () => {
    renderItem(
      makeThread({
        title: "Align worktree checkout",
        branch: "feat/worktree-checkout",
        worktreePath: "/tmp/noyau-feat-worktree-checkout",
        sessionStatus: "running",
        latestTurn: {
          turnId: TurnId.make("40000000-0000-4000-8000-000000000001"),
          state: "running",
          requestedAt: "2026-08-23T12:00:00.000Z",
          startedAt: "2026-08-23T12:00:00.000Z",
          completedAt: null,
        },
      }),
      pullRequest,
    )

    const title = screen.getByText("Align worktree checkout")
    const branch = screen.getByText("feat/worktree-checkout")
    const status = screen.getByRole("status")
    const pr = screen.getByRole("link", { name: /PR #213/ })

    expect(status.textContent).toBe("En cours")
    expect(title.parentElement).not.toBe(branch.parentElement)
    expect(title.parentElement?.contains(status)).toBe(true)
    expect(title.parentElement?.contains(pr)).toBe(false)
    expect(branch.parentElement?.contains(pr)).toBe(true)
    expect(screen.getByLabelText("Worktree")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Align worktree checkout" })).toBeTruthy()
  })

  it("reserves the checkout row when the Checkout and PR are absent", () => {
    renderItem(makeThread({ title: "Statut visuel des turns" }))

    expect(screen.getByText("Statut visuel des turns")).toBeTruthy()
    expect(document.querySelector("[data-slot=thread-sidebar-checkout]")).not.toBeNull()
    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.queryByLabelText("Worktree")).toBeNull()
    expect(screen.queryByLabelText("Branche")).toBeNull()
    expect(screen.queryByRole("link", { name: /PR #/ })).toBeNull()
  })

  it("shows a local Checkout branch without a Worktree icon", () => {
    renderItem(makeThread({ branch: "feat/local-checkout", worktreePath: null }))

    expect(screen.getByText("feat/local-checkout")).toBeTruthy()
    expect(screen.getByLabelText("Branche")).toBeTruthy()
    expect(screen.queryByLabelText("Worktree")).toBeNull()
  })

  it("falls back to the live WorkspaceRoot branch when the Checkout is unbound", () => {
    renderItem(makeThread({ title: "Statut visuel des turns" }), null, "main")

    expect(screen.getByText("main")).toBeTruthy()
    expect(screen.getByLabelText("Branche")).toBeTruthy()
    expect(screen.queryByLabelText("Worktree")).toBeNull()
  })

  it("keeps a live PR on the meta row when the branch is unknown", () => {
    renderItem(makeThread({ title: "PR sans branche" }), pullRequest)

    const title = screen.getByText("PR sans branche")
    const pr = screen.getByRole("link", { name: /PR #213/ })

    expect(title.parentElement?.contains(pr)).toBe(false)
    expect(pr.parentElement?.querySelector("span.flex-1")).not.toBeNull()
    expect(screen.queryByLabelText("Worktree")).toBeNull()
  })
})
