// @vitest-environment happy-dom

import { DomainEvent, EventEnvelope } from "@noyau/contracts/events"
import { ProjectId, ThreadId, TicketId } from "@noyau/contracts/ids"
import { ThreadShell, type ThreadShell as ThreadShellType } from "@noyau/contracts/shell"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Effect, Schema } from "effect"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { TicketActivityThreadChip } from "../src/components/board/TicketActivityThreadChip"
import { TicketDialog } from "../src/components/board/TicketDialog"
import type { BoardTicket } from "../src/lib/board-model"

Object.defineProperty(HTMLElement.prototype, "getAnimations", {
  configurable: true,
  value: () => [],
})

afterEach(() => {
  cleanup()
})

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const ticketId = TicketId.make("30000000-0000-4000-8000-000000000001")
const encodeEvent = Schema.encodeSync(DomainEvent)

const ticket: BoardTicket = {
  id: ticketId,
  columnId: "column-backlog",
  position: 0,
  title: "Préparer la reprise",
  description: "",
  priority: "normal",
}

const makeThread = (status: ThreadShellType["status"] = "active"): ThreadShellType =>
  Schema.decodeSync(ThreadShell)({
    id: threadId,
    projectId,
    title: "Thread de reprise",
    provider: "cursor",
    modelSelection: null,
    runtimeMode: "full-access",
    status,
    latestTurn: null,
    sessionStatus: null,
    lastError: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
  })

const linkedEnvelope = Schema.decodeSync(EventEnvelope)({
  eventId: "60000000-0000-4000-8000-000000000001",
  projectId,
  actorId: "human:local",
  correlationId: "80000000-0000-4000-8000-000000000001",
  causationId: "90000000-0000-4000-8000-000000000001",
  occurredAt: "2026-08-19T15:30:00.000Z",
  schemaVersion: 1,
  sequence: 1,
  event: encodeEvent({
    _tag: "ticket.thread.linked",
    ticketId,
    threadId,
  }),
})

const dialogProps = {
  ticket,
  tickets: [ticket],
  columns: [
    {
      id: "column-backlog",
      name: "Backlog",
      color: "#64748B",
      done: false,
    },
  ],
  ticketDependencies: [],
  ticketThreads: [],
  activity: [linkedEnvelope],
  activityLoading: false,
  focusTitle: false,
  onClose: vi.fn(),
  onTitleFocusComplete: vi.fn(),
  onUpdate: vi.fn(),
  onAddDependency: vi.fn(),
  onRemoveDependency: vi.fn(),
  onLinkThread: vi.fn(),
  onUnlinkThread: vi.fn(),
  archiveBlockedByTitles: [],
  onArchive: vi.fn(),
} as const

describe("ticket activity thread chip", () => {
  it("jumps to an active Thread", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const user = userEvent.setup()
        const onOpenThread = vi.fn()
        render(
          <TicketActivityThreadChip
            thread={{
              threadId,
              title: "Thread de reprise",
              availability: "active",
            }}
            onOpenThread={onOpenThread}
          />,
        )

        yield* Effect.promise(() =>
          user.click(screen.getByRole("button", { name: "Ouvrir le Thread Thread de reprise" })),
        )
        expect(onOpenThread).toHaveBeenCalledWith(threadId)
      }),
    ))

  it("does not jump when the Thread is archived or missing", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const user = userEvent.setup()
        const onOpenThread = vi.fn()
        render(
          <>
            <TicketActivityThreadChip
              thread={{
                threadId,
                title: "Thread de reprise",
                availability: "archived",
              }}
              onOpenThread={onOpenThread}
            />
            <TicketActivityThreadChip
              thread={{
                threadId: "20000000-0000-4000-8000-000000000002",
                title: "un thread",
                availability: "missing",
              }}
              onOpenThread={onOpenThread}
            />
          </>,
        )

        expect(screen.queryByRole("button", { name: /Ouvrir le Thread/ })).toBeNull()
        const chips = screen.getAllByTitle(/ouverture impossible/i)
        expect(chips).toHaveLength(2)
        yield* Effect.promise(() => user.click(chips[0] ?? chips[1]))
        expect(onOpenThread).not.toHaveBeenCalled()
      }),
    ))

  it("renders a jumpable chip in the Ticket system activity", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const user = userEvent.setup()
        const onOpenThread = vi.fn()
        render(
          <TicketDialog {...dialogProps} threads={[makeThread()]} onOpenThread={onOpenThread} />,
        )

        expect(screen.getByText(/a lié le ticket à/)).toBeTruthy()
        yield* Effect.promise(() =>
          user.click(screen.getByRole("button", { name: "Ouvrir le Thread Thread de reprise" })),
        )
        expect(onOpenThread).toHaveBeenCalledWith(threadId)
      }),
    ))

  it("keeps an archived linked Thread visible but not jumpable", () => {
    const onOpenThread = vi.fn()
    render(
      <TicketDialog
        {...dialogProps}
        threads={[makeThread("archived")]}
        onOpenThread={onOpenThread}
      />,
    )

    expect(screen.getByText("Thread de reprise")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Ouvrir le Thread Thread de reprise" })).toBeNull()
    expect(screen.getByTitle("Thread supprimé — ouverture impossible")).toBeTruthy()
  })
})
