// @vitest-environment happy-dom

import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"

import { TicketArchiveConfirmDialog } from "../src/components/board/TicketArchiveConfirmDialog"
import { TicketDialog } from "../src/components/board/TicketDialog"
import type { BoardTicket } from "../src/lib/board-model"
import { formatQuotedList } from "../src/lib/quoted-list"

Object.defineProperty(HTMLElement.prototype, "getAnimations", {
  configurable: true,
  value: () => [],
})

afterEach(() => {
  cleanup()
})

const ticket: BoardTicket = {
  id: "ticket-http",
  columnId: "column-backlog",
  position: 0,
  title: "Définir la frontière RPC du Tableau",
  description: "",
  priority: "high",
}

describe("ticket archive confirmation", () => {
  it("quotes one or several titles", () => {
    expect(formatQuotedList([])).toBe("")
    expect(formatQuotedList(["Alpha"])).toBe('"Alpha"')
    expect(formatQuotedList(["Alpha", "Beta"])).toBe('"Alpha" and "Beta"')
    expect(formatQuotedList(["Alpha", "Beta", "Gamma"])).toBe('"Alpha", "Beta" and "Gamma"')
  })

  it("does not archive until the confirmation is accepted", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const user = userEvent.setup()
        const onConfirm = vi.fn()
        render(
          <TicketArchiveConfirmDialog
            open
            ticketTitle={ticket.title}
            blockedByTitles={[]}
            onOpenChange={vi.fn()}
            onConfirm={onConfirm}
          />,
        )

        expect(screen.getByRole("alertdialog")).toBeTruthy()
        expect(screen.getByText(/will leave the Board/)).toBeTruthy()
        yield* Effect.promise(() => user.click(screen.getByRole("button", { name: "Cancel" })))
        expect(onConfirm).not.toHaveBeenCalled()

        yield* Effect.promise(() => user.click(screen.getByRole("button", { name: "Archive" })))
        expect(onConfirm).toHaveBeenCalledTimes(1)
      }),
    ))

  it("mentions open dependencies in the confirmation copy", () => {
    render(
      <TicketArchiveConfirmDialog
        open
        ticketTitle={ticket.title}
        blockedByTitles={["Définir la frontière RPC du Tableau"]}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText(/still blocked by "Définir la frontière RPC du Tableau"/)).toBeTruthy()
  })

  it("opens the confirmation from the Ticket Dialog before archiving", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const user = userEvent.setup()
        const onArchive = vi.fn()
        render(
          <TicketDialog
            ticket={ticket}
            tickets={[ticket]}
            columns={[
              {
                id: "column-backlog",
                name: "Backlog",
                color: "#64748B",
                done: false,
              },
            ]}
            ticketDependencies={[]}
            ticketThreads={[]}
            threads={[]}
            activity={[]}
            activityLoading={false}
            focusTitle={false}
            onClose={vi.fn()}
            onTitleFocusComplete={vi.fn()}
            onUpdate={vi.fn()}
            onAddDependency={vi.fn()}
            onRemoveDependency={vi.fn()}
            onLinkThread={vi.fn()}
            onUnlinkThread={vi.fn()}
            archiveBlockedByTitles={[]}
            onArchive={onArchive}
          />,
        )

        expect(screen.queryByRole("alertdialog")).toBeNull()
        yield* Effect.promise(() => user.click(screen.getByRole("button", { name: "Archive" })))
        const confirmation = screen.getByRole("alertdialog")
        expect(confirmation).toBeTruthy()
        expect(onArchive).not.toHaveBeenCalled()

        yield* Effect.promise(() =>
          user.click(within(confirmation).getByRole("button", { name: "Cancel" })),
        )
        expect(onArchive).not.toHaveBeenCalled()

        yield* Effect.promise(() => user.click(screen.getByRole("button", { name: "Archive" })))
        yield* Effect.promise(() =>
          user.click(
            within(screen.getByRole("alertdialog")).getByRole("button", { name: "Archive" }),
          ),
        )
        expect(onArchive).toHaveBeenCalledWith(ticket.id)
      }),
    ))
})
