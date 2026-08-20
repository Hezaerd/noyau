// @vitest-environment happy-dom

import type { TicketThread } from "@noyau/protocol/entities/ticket-thread"
import { TranscriptItem } from "@noyau/protocol/entities/transcript"
import { ProjectId, ThreadId, TicketId, TurnId } from "@noyau/protocol/ids"
import { ThreadShell, type ThreadShell as ThreadShellType } from "@noyau/protocol/shell"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Schema } from "effect"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { TicketDialog } from "../src/components/board/TicketDialog"
import { ThreadSidebarPopover } from "../src/components/sidebar/ThreadSidebarPopover"
import { ThreadSidebarSection } from "../src/components/sidebar/ThreadSidebarSection"
import { ThreadComposer } from "../src/components/thread/ThreadComposer"
import { ThreadStatusNotices } from "../src/components/thread/ThreadStatusNotices"
import { ThreadTicketLinkEditor } from "../src/components/thread/ThreadTicketLinks"
import { ThreadTitleBar } from "../src/components/thread/ThreadTitleBar"
import { ThreadTranscriptItem } from "../src/components/thread/ThreadTranscriptItem"
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

  it("renders a compact Thread popover with the available shell facts", () => {
    render(
      <ThreadSidebarPopover
        thread={makeThread(threadId, "Ajouter shortcut pour les settings")}
        project={{
          name: "noyau",
          workspaceRoot: "/Users/hezaerd/code/noyau",
        }}
      />,
    )

    expect(screen.getByText("Ajouter shortcut pour les settings")).toBeTruthy()
    expect(screen.getByText("noyau")).toBeTruthy()
    expect(screen.getByText("Cursor")).toBeTruthy()
    expect(screen.getByText("Accès complet")).toBeTruthy()
    expect(screen.queryByText("/Users/hezaerd/code/noyau")).toBeNull()
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

  it("renames and regenerates a Thread title from the title bar", async () => {
    const user = userEvent.setup()
    const onRename = vi.fn(async () => true)
    const onRegenerate = vi.fn(async () => true)
    render(
      <ThreadTitleBar
        title="Nouveau thread"
        isRegenerating={false}
        onRename={onRename}
        onRegenerate={onRegenerate}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Nouveau thread" }))
    await user.clear(screen.getByRole("textbox", { name: "Renommer le Thread" }))
    await user.type(screen.getByRole("textbox", { name: "Renommer le Thread" }), "Reprise Session")
    await user.keyboard("{Enter}")
    expect(onRename).toHaveBeenCalledWith("Reprise Session")

    await user.click(screen.getByRole("button", { name: "Régénérer le titre" }))
    expect(onRegenerate).toHaveBeenCalledTimes(1)
  })

  it("gates the composer while Cursor is unavailable", () => {
    render(
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
      />,
    )

    expect(
      screen.getByRole("textbox", { name: "Composer un message" }).hasAttribute("disabled"),
    ).toBe(true)
    expect(screen.getByRole("button", { name: "Envoyer" }).hasAttribute("disabled")).toBe(true)
    const composer = screen.getByRole("textbox", { name: "Composer un message" }).closest("form")
    expect(composer?.className).toMatch(/sticky/)
    expect(composer?.className).toMatch(/bottom-0/)
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

  it("renders streamed assistant markdown inside a Message row", () => {
    const item = Schema.decodeSync(TranscriptItem)({
      _tag: "transcript.assistant",
      threadId,
      turnId: TurnId.make("40000000-0000-4000-8000-000000000001"),
      text: "Voici **un** plan.",
    })

    render(
      <ThreadTranscriptItem
        item={item}
        streaming
        answer=""
        onAnswerChange={vi.fn()}
        onRespondApproval={vi.fn()}
        onRespondUserInput={vi.fn()}
      />,
    )

    expect(screen.queryByText("Cursor")).toBeNull()
    expect(screen.getByText("un")).toBeTruthy()
  })
})
