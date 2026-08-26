// @vitest-environment happy-dom

import { WorkspaceRoot } from "@noyau/protocol/entities/environment"
import { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { ThreadShell, type ThreadShell as ThreadShellType } from "@noyau/protocol/shell"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Effect, Schema } from "effect"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { ThreadDeleteConfirmDialog } from "../src/components/sidebar/ThreadDeleteConfirmDialog"
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
const threadLink = () => screen.getByRole("link", { name: new RegExp(threadTitle) })
const workspaceRoot = Schema.decodeSync(WorkspaceRoot)("/tmp/noyau")

const thread = Schema.decodeSync(ThreadShell)({
  id: threadId,
  projectId,
  title: threadTitle,
  provider: "cursor",
  modelSelection: null,
  runtimeMode: "full-access",
  status: "active",
  latestTurn: null,
  sessionStatus: null,
  lastError: null,
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
}) satisfies ThreadShellType

describe("thread delete confirmation", () => {
  it("does not delete until the confirmation is accepted", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const user = userEvent.setup()
        const onConfirm = vi.fn()
        render(
          <ThreadDeleteConfirmDialog
            open
            threadTitle={threadTitle}
            onOpenChange={vi.fn()}
            onConfirm={onConfirm}
          />,
        )

        expect(screen.getByRole("alertdialog")).toBeTruthy()
        expect(screen.getByText(/définitivement retiré/)).toBeTruthy()
        yield* Effect.promise(() => user.click(screen.getByRole("button", { name: "Annuler" })))
        expect(onConfirm).not.toHaveBeenCalled()

        yield* Effect.promise(() => user.click(screen.getByRole("button", { name: "Supprimer" })))
        expect(onConfirm).toHaveBeenCalledTimes(1)
      }),
    ))

  it("opens the confirmation from the sidebar before deleting", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const user = userEvent.setup()
        render(
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
          </SidebarProvider>,
        )

        expect(screen.queryByRole("alertdialog")).toBeNull()
        yield* Effect.promise(() =>
          user.pointer({
            keys: "[MouseRight]",
            target: threadLink(),
          }),
        )
        const deleteItem = yield* Effect.promise(() =>
          screen.findByRole("menuitem", { name: "Supprimer" }),
        )
        yield* Effect.promise(() => user.click(deleteItem))

        const confirmation = yield* Effect.promise(() =>
          waitFor(() => screen.getByRole("alertdialog")),
        )
        expect(confirmation).toBeTruthy()
        expect(buildAndDispatchCommand).not.toHaveBeenCalled()

        yield* Effect.promise(() =>
          user.click(within(confirmation).getByRole("button", { name: "Annuler" })),
        )
        expect(buildAndDispatchCommand).not.toHaveBeenCalled()

        yield* Effect.promise(() =>
          user.pointer({
            keys: "[MouseRight]",
            target: threadLink(),
          }),
        )
        const secondDeleteItem = yield* Effect.promise(() =>
          screen.findByRole("menuitem", { name: "Supprimer" }),
        )
        yield* Effect.promise(() => user.click(secondDeleteItem))
        const secondConfirmation = yield* Effect.promise(() =>
          waitFor(() => screen.getByRole("alertdialog")),
        )
        yield* Effect.promise(() =>
          user.click(within(secondConfirmation).getByRole("button", { name: "Supprimer" })),
        )
        yield* Effect.promise(() =>
          waitFor(() => {
            expect(buildAndDispatchCommand).toHaveBeenCalledTimes(1)
          }),
        )
      }),
    ))
})
