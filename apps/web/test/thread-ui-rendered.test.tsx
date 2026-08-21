// @vitest-environment happy-dom

import type { TicketThread } from "@noyau/protocol/entities/ticket-thread"
import { TranscriptItem } from "@noyau/protocol/entities/transcript"
import { ProjectId, ThreadId, TicketId, TurnId } from "@noyau/protocol/ids"
import { ThreadShell, type ThreadShell as ThreadShellType } from "@noyau/protocol/shell"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Effect, Schema } from "effect"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { TicketDialog } from "../src/components/board/TicketDialog"
import { ThreadSidebarPopover } from "../src/components/sidebar/ThreadSidebarPopover"
import { ThreadSidebarSection } from "../src/components/sidebar/ThreadSidebarSection"
import { ThreadComposer } from "../src/components/thread/ThreadComposer"
import { ThreadStatusNotices } from "../src/components/thread/ThreadStatusNotices"
import { ThreadTicketLinkEditor } from "../src/components/thread/ThreadTicketLinks"
import { ThreadTranscript } from "../src/components/thread/ThreadTranscript"
import { ThreadTranscriptItem } from "../src/components/thread/ThreadTranscriptItem"
import { ThreadPageTitle } from "../src/components/WorkspaceBreadcrumb"
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
const cursorModels = [
  {
    modelId: "composer-2.5",
    label: "Composer 2.5",
    reasoningEfforts: [
      { value: "low", label: "Faible" },
      { value: "high", label: "Élevé" },
    ],
  },
]

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

  it("gates the composer while Cursor is unavailable", () => {
    render(
      <ThreadComposer
        isRunning={false}
        disabled
        text=""
        runtimeMode="full-access"
        models={cursorModels}
        modelSelection={null}
        error={undefined}
        onSubmit={vi.fn()}
        onTextChange={vi.fn()}
        onRuntimeModeChange={vi.fn()}
        onModelSelectionChange={vi.fn()}
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

  it("submits with Enter and keeps Shift+Enter for a new line", () => {
    const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
    })
    render(
      <ThreadComposer
        isRunning={false}
        disabled={false}
        text="Lancer les tests"
        runtimeMode="full-access"
        models={cursorModels}
        modelSelection={null}
        error={undefined}
        onSubmit={onSubmit}
        onTextChange={vi.fn()}
        onRuntimeModeChange={vi.fn()}
        onModelSelectionChange={vi.fn()}
        onPaste={vi.fn()}
        onDrop={vi.fn()}
        onInterrupt={vi.fn()}
      />,
    )

    const composer = screen.getByRole("textbox", { name: "Composer un message" })
    fireEvent.keyDown(composer, { key: "Enter", shiftKey: true })
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.keyDown(composer, { key: "Enter" })
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it("changes the Thread access level from the composer", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const user = userEvent.setup()
        const onRuntimeModeChange = vi.fn()
        render(
          <ThreadComposer
            isRunning={false}
            disabled={false}
            text="Préparer la reprise"
            runtimeMode="full-access"
            models={cursorModels}
            modelSelection={null}
            error={undefined}
            onSubmit={vi.fn()}
            onTextChange={vi.fn()}
            onRuntimeModeChange={onRuntimeModeChange}
            onModelSelectionChange={vi.fn()}
            onPaste={vi.fn()}
            onDrop={vi.fn()}
            onInterrupt={vi.fn()}
          />,
        )

        yield* Effect.promise(() =>
          user.click(screen.getByRole("combobox", { name: "Niveau d’accès" })),
        )
        yield* Effect.promise(() =>
          user.click(screen.getByRole("option", { name: "Approbation requise" })),
        )
        expect(onRuntimeModeChange).toHaveBeenCalledWith("approval-required")
      }),
    ))

  it("changes the Cursor model and reasoning effort from the composer", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const user = userEvent.setup()
        const onModelSelectionChange = vi.fn()
        const { rerender } = render(
          <ThreadComposer
            isRunning={false}
            disabled={false}
            text="Préparer la reprise"
            runtimeMode="full-access"
            models={cursorModels}
            modelSelection={null}
            error={undefined}
            onSubmit={vi.fn()}
            onTextChange={vi.fn()}
            onRuntimeModeChange={vi.fn()}
            onModelSelectionChange={onModelSelectionChange}
            onPaste={vi.fn()}
            onDrop={vi.fn()}
            onInterrupt={vi.fn()}
          />,
        )

        yield* Effect.promise(() => user.click(screen.getByRole("combobox", { name: "Modèle" })))
        yield* Effect.promise(() =>
          user.click(screen.getByRole("option", { name: "Composer 2.5" })),
        )
        expect(onModelSelectionChange).toHaveBeenCalledWith({ modelId: "composer-2.5" })

        rerender(
          <ThreadComposer
            isRunning={false}
            disabled={false}
            text="Préparer la reprise"
            runtimeMode="full-access"
            models={cursorModels}
            modelSelection={{ modelId: "composer-2.5" }}
            error={undefined}
            onSubmit={vi.fn()}
            onTextChange={vi.fn()}
            onRuntimeModeChange={vi.fn()}
            onModelSelectionChange={onModelSelectionChange}
            onPaste={vi.fn()}
            onDrop={vi.fn()}
            onInterrupt={vi.fn()}
          />,
        )
        yield* Effect.promise(() => user.click(screen.getByRole("combobox", { name: "Effort" })))
        yield* Effect.promise(() => user.click(screen.getByRole("option", { name: "Élevé" })))
        expect(onModelSelectionChange).toHaveBeenLastCalledWith({
          modelId: "composer-2.5",
          reasoningEffort: "high",
        })
      }),
    ))

  it("edits TicketThread links from the Thread side", () =>
    Effect.runPromise(
      Effect.gen(function* () {
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

        yield* Effect.promise(() =>
          user.click(screen.getByRole("combobox", { name: "Lier un ticket" })),
        )
        yield* Effect.promise(() =>
          user.click(screen.getByRole("option", { name: "Ajouter ce Ticket" })),
        )
        expect(onSelectionChange).toHaveBeenCalledWith(ticketId)

        yield* Effect.promise(() =>
          user.click(screen.getByRole("button", { name: "Délier le ticket Déjà lié" })),
        )
        expect(onUnlink).toHaveBeenCalledWith(linkedTicketId)
      }),
    ))

  it("edits TicketThread links from the Ticket side", () =>
    Effect.runPromise(
      Effect.gen(function* () {
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
          archiveBlockedByTitles: [],
          onArchive: vi.fn(),
        } as const

        render(<TicketDialog {...baseProps} ticketThreads={[]} />)
        yield* Effect.promise(() => user.click(screen.getByText("Ajouter un Thread lié")))
        yield* Effect.promise(() =>
          user.click(screen.getByRole("option", { name: "Thread de reprise" })),
        )
        expect(onLinkThread).toHaveBeenCalledWith(ticket.id, thread.id)

        cleanup()
        const linked: TicketThread = { ticketId: TicketId.make(ticket.id), threadId: thread.id }
        render(<TicketDialog {...baseProps} ticketThreads={[linked]} />)
        yield* Effect.promise(() =>
          user.click(screen.getByRole("button", { name: "Délier le Thread Thread de reprise" })),
        )
        expect(onUnlinkThread).toHaveBeenCalledWith(ticket.id, thread.id)
      }),
    ))

  it("renders a tool call as a verb and object, not a JSON dump", () => {
    const item = Schema.decodeSync(TranscriptItem)({
      _tag: "transcript.tool",
      threadId,
      turnId: TurnId.make("40000000-0000-4000-8000-000000000001"),
      toolCallId: "tool-1",
      name: "Cursor tool",
      status: "completed",
      outputSummary: '{"content":"# VETOSUD\\nimport { Image }"}',
    })

    render(
      <ThreadTranscriptItem
        item={item}
        streaming={false}
        answer=""
        onAnswerChange={vi.fn()}
        onRespondApproval={vi.fn()}
        onRespondUserInput={vi.fn()}
      />,
    )

    expect(screen.getByText("Wrote")).toBeTruthy()
    expect(screen.getByText("Wrote").parentElement?.classList.contains("shimmer")).toBe(false)
    expect(screen.queryByText(/"content"/)).toBeNull()
    expect(screen.queryByText("Cursor tool")).toBeNull()
  })

  it("shimmers only while a tool call is in progress", () => {
    const item = Schema.decodeSync(TranscriptItem)({
      _tag: "transcript.tool",
      threadId,
      turnId: TurnId.make("40000000-0000-4000-8000-000000000001"),
      toolCallId: "tool-1",
      name: "Read file",
      status: "in_progress",
      action: "read",
      outputSummary: "src/index.ts",
    })

    render(
      <ThreadTranscriptItem
        item={item}
        streaming={false}
        answer=""
        onAnswerChange={vi.fn()}
        onRespondApproval={vi.fn()}
        onRespondUserInput={vi.fn()}
      />,
    )

    expect(screen.getByText("Read").parentElement?.classList.contains("shimmer")).toBe(true)
  })

  it("collapses a burst of file changes behind one toggle", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const user = userEvent.setup()
        const turnId = TurnId.make("40000000-0000-4000-8000-000000000001")
        const transcript = ["index.astro", "ClinicCard.astro", "base.css"].map((path, index) =>
          Schema.decodeSync(TranscriptItem)({
            _tag: "transcript.tool",
            threadId,
            turnId,
            toolCallId: `tool-${String(index)}`,
            name: "Wrote file",
            status: "completed",
            action: "file_change",
            outputSummary: path,
          }),
        )

        render(
          <ThreadTranscript
            transcript={transcript}
            isRunning={false}
            loading={false}
            error={undefined}
            notices={null}
            footer={null}
            answerByRequest={{}}
            onAnswerChange={vi.fn()}
            onRespondApproval={vi.fn()}
            onRespondUserInput={vi.fn()}
          />,
        )

        expect(screen.getByRole("button", { name: "Changed 3 files" })).toBeTruthy()
        expect(screen.queryByText("index.astro")).toBeNull()

        yield* Effect.promise(() =>
          user.click(screen.getByRole("button", { name: "Changed 3 files" })),
        )
        expect(screen.getByText("index.astro")).toBeTruthy()
        expect(screen.getByText("ClinicCard.astro")).toBeTruthy()
      }),
    ))

  it("hides the Turn rail until the Thread has two user Turns", () => {
    const firstTurn = TurnId.make("40000000-0000-4000-8000-000000000001")
    render(
      <ThreadTranscript
        transcript={[
          Schema.decodeSync(TranscriptItem)({
            _tag: "transcript.user",
            threadId,
            turnId: firstTurn,
            text: "Seul prompt",
          }),
        ]}
        isRunning={false}
        loading={false}
        error={undefined}
        notices={null}
        footer={null}
        answerByRequest={{}}
        onAnswerChange={vi.fn()}
        onRespondApproval={vi.fn()}
        onRespondUserInput={vi.fn()}
      />,
    )

    expect(screen.queryByTestId("thread-turn-minimap")).toBeNull()
  })

  it("shows a Turn rail preview when the pointer scrubs the left gutter", () => {
    const firstTurn = TurnId.make("40000000-0000-4000-8000-000000000001")
    const secondTurn = TurnId.make("40000000-0000-4000-8000-000000000002")
    render(
      <ThreadTranscript
        transcript={[
          Schema.decodeSync(TranscriptItem)({
            _tag: "transcript.user",
            threadId,
            turnId: firstTurn,
            text: "Premier prompt",
          }),
          Schema.decodeSync(TranscriptItem)({
            _tag: "transcript.assistant",
            threadId,
            turnId: firstTurn,
            text: "Première réponse",
          }),
          Schema.decodeSync(TranscriptItem)({
            _tag: "transcript.user",
            threadId,
            turnId: secondTurn,
            text: "Deuxième prompt",
          }),
          Schema.decodeSync(TranscriptItem)({
            _tag: "transcript.assistant",
            threadId,
            turnId: secondTurn,
            text: "Deuxième réponse",
          }),
        ]}
        isRunning={false}
        loading={false}
        error={undefined}
        notices={null}
        footer={null}
        answerByRequest={{}}
        onAnswerChange={vi.fn()}
        onRespondApproval={vi.fn()}
        onRespondUserInput={vi.fn()}
      />,
    )

    const rail = screen.getByTestId("thread-turn-minimap")
    const button = rail.querySelector("button")
    expect(button).toBeTruthy()
    if (button === null) {
      return
    }

    button.getBoundingClientRect = () => new DOMRect(12, 100, 40, 8)

    expect(rail.querySelector("[data-turn-minimap-preview]")).toBeNull()
    fireEvent.mouseMove(button, { clientY: 108 })
    const preview = rail.querySelector("[data-turn-minimap-preview]")
    expect(preview?.textContent).toContain("Deuxième prompt")
    expect(preview?.textContent).toContain("Deuxième réponse")
  })

  it("shows Cursor écrit only while waiting for the first assistant row", () => {
    const turnId = TurnId.make("40000000-0000-4000-8000-000000000001")
    const user = Schema.decodeSync(TranscriptItem)({
      _tag: "transcript.user",
      threadId,
      turnId,
      text: "Ouvre le dossier",
    })
    const assistant = Schema.decodeSync(TranscriptItem)({
      _tag: "transcript.assistant",
      threadId,
      turnId,
      text: "Voici **un** plan.",
    })

    const waiting = render(
      <ThreadTranscript
        transcript={[user]}
        isRunning
        loading={false}
        error={undefined}
        notices={null}
        footer={null}
        answerByRequest={{}}
        onAnswerChange={vi.fn()}
        onRespondApproval={vi.fn()}
        onRespondUserInput={vi.fn()}
      />,
    )
    expect(waiting.getByText("Cursor écrit…")).toBeTruthy()
    waiting.unmount()

    render(
      <ThreadTranscript
        transcript={[user, assistant]}
        isRunning
        loading={false}
        error={undefined}
        notices={null}
        footer={null}
        answerByRequest={{}}
        onAnswerChange={vi.fn()}
        onRespondApproval={vi.fn()}
        onRespondUserInput={vi.fn()}
      />,
    )
    expect(screen.getByText("un")).toBeTruthy()
    expect(screen.queryByText("Cursor écrit…")).toBeNull()
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

  it("renders the chrome as Project / Thread instead of a static Thread label", () => {
    render(<ThreadPageTitle projectName="noyau" threadTitle="Exclure les subtrees du graphe" />)

    expect(screen.getByRole("navigation", { name: "Fil d’Ariane du Thread" })).toBeTruthy()
    expect(screen.getByText("noyau")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Exclure les subtrees du graphe" })).toBeTruthy()
  })
})
