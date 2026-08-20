// @vitest-environment happy-dom

import type { TicketThread } from "@noyau/protocol/entities/ticket-thread"
import { ProjectId, ThreadId, TicketId } from "@noyau/protocol/ids"
import { ThreadShell, type ThreadShell as ThreadShellType } from "@noyau/protocol/shell"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Schema } from "effect"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { TicketDialog } from "../src/components/board/TicketDialog"
import { ThreadSidebarSection } from "../src/components/sidebar/ThreadSidebarSection"
import { CursorReadinessChip } from "../src/components/thread/CursorReadinessChip"
import { ThreadComposer } from "../src/components/thread/ThreadComposer"
import { ThreadRuntimeModePicker } from "../src/components/thread/ThreadRuntimeModePicker"
import { ThreadStatusNotices } from "../src/components/thread/ThreadStatusNotices"
import { ThreadTicketLinkEditor } from "../src/components/thread/ThreadTicketLinks"
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
const secondThreadId = ThreadId.make("20000000-0000-4000-8000-000000000002")
const ticketId = TicketId.make("30000000-0000-4000-8000-000000000001")
const linkedTicketId = TicketId.make("30000000-0000-4000-8000-000000000002")

const makeThread = (id: ThreadId, title: string): ThreadShellType =>
  Schema.decodeSync(ThreadShell)({
    id,
    projectId,
    title,
    provider: "cursor",
    runtimeMode: "full-access",
    status: "active",
    latestTurn: null,
    sessionStatus: null,
    lastError: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
  })

const ticket: BoardTicket = {
  id: ticketId,
  columnId: "column-backlog",
  position: 0,
  title: "Préparer la reprise",
  description: "",
  priority: "normal",
}

function RuntimeModeHarness() {
  const [value, setValue] = useState<
    "approval-required" | "auto-accept-edits" | "auto" | "full-access"
  >("full-access")
  return <ThreadRuntimeModePicker value={value} onChange={setValue} />
}

describe("rendered Thread UI evidence", () => {
  it("renders titled Threads under an explicit Sidebar Threads heading", () => {
    render(
      <ThreadSidebarSection
        threads={[
          makeThread(threadId, "Corriger la reprise"),
          makeThread(secondThreadId, "Documenter Cursor"),
        ]}
        renderThread={(thread) => <a href={`/thread/${thread.id}`}>{thread.title}</a>}
      />,
    )

    expect(screen.getByRole("region", { name: "Threads" })).toBeTruthy()
    expect(screen.getByText("Threads")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Corriger la reprise" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Documenter Cursor" })).toBeTruthy()
  })

  it("renders Session lastError and human interruption separately", () => {
    render(
      <ThreadStatusNotices
        session={{ status: "error", lastError: "ACP indisponible" }}
        latestTurn={{ state: "interrupted" }}
      />,
    )

    expect(screen.getByRole("alert").textContent).toContain("ACP indisponible")
    expect(screen.getByText(/You stopped/)).toBeTruthy()
    expect(screen.queryByText(/lost/i)).toBeNull()
  })

  it("renders and changes among all four runtimeMode values", async () => {
    const user = userEvent.setup()

    render(<RuntimeModeHarness />)
    await user.click(screen.getByRole("combobox", { name: "Mode d’exécution" }))

    expect(screen.getByText("Approbation requise")).toBeTruthy()
    expect(screen.getByText("Accepter les éditions")).toBeTruthy()
    expect(screen.getByText("Automatique")).toBeTruthy()
    expect(screen.getAllByText("Accès complet").length).toBeGreaterThan(0)

    await user.click(screen.getByText("Automatique"))
    expect(screen.getByRole("combobox", { name: "Mode d’exécution" }).textContent).toContain(
      "Automatique",
    )
  })

  it("renders Cursor readiness and gates the composer while unavailable", () => {
    render(
      <>
        <CursorReadinessChip status={{ installed: true, handshakeOk: false }} />
        <ThreadComposer
          isNewThread
          isRunning={false}
          disabled
          text=""
          error={undefined}
          onSubmit={vi.fn()}
          onTextChange={vi.fn()}
          onPaste={vi.fn()}
          onDrop={vi.fn()}
          onInterrupt={vi.fn()}
        />
      </>,
    )

    expect(screen.getByText("Cursor indisponible")).toBeTruthy()
    expect(screen.getByRole("textbox", { name: "Composer un message" }).disabled).toBe(true)
    expect(screen.getByRole("button", { name: "Envoyer" }).disabled).toBe(true)
  })

  it("edits TicketThread links from the Thread side", async () => {
    const user = userEvent.setup()
    const onSelectionChange = vi.fn()
    const onUnlink = vi.fn()
    render(
      <ThreadTicketLinkEditor
        linkedTickets={[{ id: linkedTicketId, title: "Déjà lié" }]}
        linkableTickets={[{ id: ticketId, title: "Ajouter ce Ticket" }]}
        selection={null}
        onSelectionChange={onSelectionChange}
        onUnlink={onUnlink}
      />,
    )

    await user.click(screen.getByRole("combobox", { name: "Lier un ticket" }))
    await user.click(screen.getByRole("option", { name: "Ajouter ce Ticket" }))
    expect(onSelectionChange).toHaveBeenCalledWith(ticketId)

    await user.click(screen.getByRole("button", { name: "Délier le ticket Déjà lié" }))
    expect(onUnlink).toHaveBeenCalledWith(linkedTicketId)
  })

  it("edits TicketThread links from the Ticket side", async () => {
    const user = userEvent.setup()
    const thread = makeThread(threadId, "Thread de reprise")
    const onLinkThread = vi.fn()
    const onUnlinkThread = vi.fn()
    const baseProps = {
      ticket,
      tickets: [ticket],
      ticketDependencies: [],
      threads: [thread],
      activity: [],
      activityLoading: false,
      focusTitle: false,
      onClose: vi.fn(),
      onTitleFocusComplete: vi.fn(),
      onUpdate: vi.fn(),
      onAddDependency: vi.fn(),
      onRemoveDependency: vi.fn(),
      onLinkThread,
      onUnlinkThread,
    } as const

    render(<TicketDialog {...baseProps} ticketThreads={[]} />)
    await user.click(screen.getByText("Ajouter un Thread lié"))
    await user.click(screen.getByRole("option", { name: "Thread de reprise" }))
    expect(onLinkThread).toHaveBeenCalledWith(ticket.id, thread.id)

    cleanup()
    const linked: TicketThread = { ticketId: TicketId.make(ticket.id), threadId: thread.id }
    render(<TicketDialog {...baseProps} ticketThreads={[linked]} />)
    await user.click(screen.getByRole("button", { name: "Délier le Thread Thread de reprise" }))
    expect(onUnlinkThread).toHaveBeenCalledWith(ticket.id, thread.id)
  })
})
