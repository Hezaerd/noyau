// @vitest-environment happy-dom

import type { TicketThread } from "@noyau/protocol/entities/ticket-thread"
import { TranscriptItem } from "@noyau/protocol/entities/transcript"
import { LatestTurn } from "@noyau/protocol/entities/turn"
import { ProjectId, ThreadId, TicketId, TurnId } from "@noyau/protocol/ids"
import { ThreadShell, type ThreadShell as ThreadShellType } from "@noyau/protocol/shell"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Effect, Schema } from "effect"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { TicketDialog } from "../src/components/board/TicketDialog"
import { ThreadSidebarPopover } from "../src/components/sidebar/ThreadSidebarPopover"
import { ThreadSidebarSection } from "../src/components/sidebar/ThreadSidebarSection"
import { ThreadSidebarStatus } from "../src/components/sidebar/ThreadSidebarStatus"
import { FixMergeConflictsButton } from "../src/components/thread/FixMergeConflictsButton"
import { ThreadComposer } from "../src/components/thread/ThreadComposer"
import { ThreadDraftHero } from "../src/components/thread/ThreadDraftHero"
import { ThreadStatusNotices } from "../src/components/thread/ThreadStatusNotices"
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
const cursorModels = [
  {
    modelId: "composer-2.5",
    label: "Composer 2.5",
    reasoningEfforts: [
      { value: "low", label: "Faible", isDefault: true },
      { value: "high", label: "Élevé" },
    ],
    serviceTiers: [
      { value: "normal", label: "Normal", isDefault: true },
      { value: "fast", label: "Fast", description: "1,5× plus rapide, usage accru" },
    ],
  },
]

const makeThread = (
  id: ThreadId,
  title: string,
  times: { readonly createdAt?: string; readonly updatedAt?: string } = {},
): ThreadShellType =>
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
    createdAt: times.createdAt ?? "2026-08-20T00:00:00.000Z",
    updatedAt: times.updatedAt ?? "2026-08-20T00:00:00.000Z",
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

  it("renders En cours and Terminé on the sidebar status cluster", () => {
    render(
      <ThreadSidebarStatus
        activity={{ kind: "working", label: "En cours" }}
        startedAtMs={Date.now() - 12_000}
      />,
    )
    expect(screen.getByRole("status").textContent).toBe("En cours")
    expect(screen.getByText("12s")).toBeTruthy()

    cleanup()
    render(
      <ThreadSidebarStatus activity={{ kind: "completed", label: "Terminé" }} startedAtMs={null} />,
    )
    expect(screen.getByRole("status").textContent).toBe("Terminé")
  })

  it("lists newer Threads above older ones", () => {
    render(
      <ThreadSidebarSection
        threads={[
          makeThread(threadId, "Ancien Thread"),
          makeThread(secondThreadId, "Nouveau Thread", {
            createdAt: "2026-08-23T12:00:00.000Z",
            updatedAt: "2026-08-23T12:00:00.000Z",
          }),
        ]}
        renderThread={(thread) => <a href={`/thread/${thread.id}`}>{thread.title}</a>}
      />,
    )

    const links = screen.getAllByRole("link")
    expect(links.map((link) => link.textContent)).toEqual(["Nouveau Thread", "Ancien Thread"])
  })

  it("keeps creation order when an older Thread is updated later", () => {
    render(
      <ThreadSidebarSection
        threads={[
          makeThread(threadId, "Ancien Thread", {
            createdAt: "2026-08-20T00:00:00.000Z",
            updatedAt: "2026-08-23T18:00:00.000Z",
          }),
          makeThread(secondThreadId, "Nouveau Thread", {
            createdAt: "2026-08-23T12:00:00.000Z",
            updatedAt: "2026-08-23T12:00:00.000Z",
          }),
        ]}
        renderThread={(thread) => <a href={`/thread/${thread.id}`}>{thread.title}</a>}
      />,
    )

    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Nouveau Thread",
      "Ancien Thread",
    ])
  })

  it("renders a compact Thread popover with the available shell facts", () => {
    render(
      <ThreadSidebarPopover
        thread={makeThread(threadId, "Ajouter shortcut pour les settings")}
        project={{
          name: "noyau",
          workspaceRoot: "/Users/hezaerd/code/noyau",
        }}
        pullRequest={null}
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

  it("shows a Fix merge conflicts toolbar above the composer", () => {
    render(
      <ThreadComposer
        isRunning={false}
        disabled={false}
        text=""
        runtimeMode="full-access"
        models={cursorModels}
        modelSelection={null}
        error={undefined}
        onSubmit={vi.fn()}
        onTextChange={vi.fn()}
        onRuntimeModeChange={vi.fn()}
        onModelSelectionChange={vi.fn()}
        images={[]}
        onPaste={vi.fn()}
        onDrop={vi.fn()}
        onImageRemove={vi.fn()}
        onInterrupt={vi.fn()}
        toolbar={<FixMergeConflictsButton disabled={false} onClick={vi.fn()} />}
      />,
    )

    expect(screen.getByRole("button", { name: "Fix merge conflicts" })).toBeTruthy()
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
        images={[]}
        onPaste={vi.fn()}
        onDrop={vi.fn()}
        onImageRemove={vi.fn()}
        onInterrupt={vi.fn()}
      />,
    )

    expect(
      screen.getByRole("textbox", { name: "Composer un message" }).getAttribute("aria-disabled"),
    ).toBe("true")
    expect(screen.getByRole("button", { name: "Envoyer" }).hasAttribute("disabled")).toBe(true)
    expect(screen.queryByRole("button", { name: "Interrompre" })).toBeNull()
    const composer = screen.getByRole("textbox", { name: "Composer un message" }).closest("form")
    expect(composer?.className).toMatch(/sticky/)
    expect(composer?.className).toMatch(/bottom-0/)
    const composerControl = screen.getByRole("textbox", { name: "Composer un message" })
    expect(composerControl.parentElement?.className).toMatch(/before:hidden/)
    const composerGroup = composerControl.closest('[data-slot="input-group"]')
    expect(composerGroup?.className).toMatch(/ring-0/)
    expect(composerGroup?.className).toMatch(
      /has-\[\[data-slot=input-group-control\]:focus-visible\]:border-input/,
    )
    expect(composerGroup?.className).toMatch(/rounded-xl/)
    expect(composerGroup?.className).toMatch(
      /has-\[\[data-slot=input-group-control\]:disabled\]:opacity-50/,
    )
    expect(composerGroup?.className).not.toMatch(/(?:^|\s)has-disabled:/)
  })

  it("keeps an empty enabled composer undimmed while Send stays disabled", () => {
    render(
      <ThreadComposer
        isRunning={false}
        disabled={false}
        text=""
        runtimeMode="full-access"
        models={cursorModels}
        modelSelection={null}
        error={undefined}
        onSubmit={vi.fn()}
        onTextChange={vi.fn()}
        onRuntimeModeChange={vi.fn()}
        onModelSelectionChange={vi.fn()}
        images={[]}
        onPaste={vi.fn()}
        onDrop={vi.fn()}
        onImageRemove={vi.fn()}
        onInterrupt={vi.fn()}
      />,
    )

    const composerControl = screen.getByRole("textbox", { name: "Composer un message" })
    expect(composerControl.hasAttribute("disabled")).toBe(false)
    expect(screen.getByRole("button", { name: "Envoyer" }).hasAttribute("disabled")).toBe(true)
    expect(screen.queryByRole("button", { name: "Interrompre" })).toBeNull()
    const composerGroup = composerControl.closest('[data-slot="input-group"]')
    expect(composerGroup?.className).toMatch(
      /has-\[\[data-slot=input-group-control\]:disabled\]:opacity-50/,
    )
    expect(composerGroup?.className).not.toMatch(/(?:^|\s)has-disabled:/)
  })

  it("auto-focuses the docked composer once it is enabled", () => {
    const composerProps = {
      isRunning: false,
      text: "",
      runtimeMode: "full-access",
      models: cursorModels,
      modelSelection: null,
      error: undefined,
      onSubmit: vi.fn(),
      onTextChange: vi.fn(),
      onRuntimeModeChange: vi.fn(),
      onModelSelectionChange: vi.fn(),
      images: [],
      onPaste: vi.fn(),
      onDrop: vi.fn(),
      onImageRemove: vi.fn(),
      onInterrupt: vi.fn(),
    } as const
    const { rerender } = render(<ThreadComposer {...composerProps} disabled />)

    expect(document.activeElement).not.toBe(
      screen.getByRole("textbox", { name: "Composer un message" }),
    )

    rerender(<ThreadComposer {...composerProps} disabled={false} />)

    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Composer un message" }),
    )
  })

  it("refocuses the composer after a remount and does not steal focus on later re-enable", () => {
    const composerProps = {
      isRunning: false,
      disabled: false,
      text: "",
      runtimeMode: "full-access",
      models: cursorModels,
      modelSelection: null,
      error: undefined,
      onSubmit: vi.fn(),
      onTextChange: vi.fn(),
      onRuntimeModeChange: vi.fn(),
      onModelSelectionChange: vi.fn(),
      images: [],
      onPaste: vi.fn(),
      onDrop: vi.fn(),
      onImageRemove: vi.fn(),
      onInterrupt: vi.fn(),
    } as const
    const { rerender } = render(<ThreadComposer key="thread-a" {...composerProps} />)
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Composer un message" }),
    )

    rerender(<ThreadComposer key="thread-b" {...composerProps} />)
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Composer un message" }),
    )

    document.body.tabIndex = -1
    document.body.focus()
    expect(document.activeElement).not.toBe(
      screen.getByRole("textbox", { name: "Composer un message" }),
    )

    rerender(<ThreadComposer key="thread-b" {...composerProps} disabled />)
    rerender(<ThreadComposer key="thread-b" {...composerProps} disabled={false} />)
    expect(document.activeElement).not.toBe(
      screen.getByRole("textbox", { name: "Composer un message" }),
    )
  })

  it("replaces send with interrupt while a Turn is running", () => {
    const onInterrupt = vi.fn()
    const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
    })
    render(
      <ThreadComposer
        isRunning
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
        images={[]}
        onPaste={vi.fn()}
        onDrop={vi.fn()}
        onImageRemove={vi.fn()}
        onInterrupt={onInterrupt}
      />,
    )

    expect(screen.queryByRole("button", { name: "Envoyer" })).toBeNull()
    const interrupt = screen.getByRole("button", { name: "Interrompre" })
    expect(interrupt.hasAttribute("disabled")).toBe(false)
    fireEvent.click(interrupt)
    expect(onInterrupt).toHaveBeenCalledOnce()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("does not offer a file-picker button for images", () => {
    render(
      <ThreadComposer
        isRunning={false}
        disabled={false}
        text=""
        runtimeMode="full-access"
        models={cursorModels}
        modelSelection={null}
        error={undefined}
        onSubmit={vi.fn()}
        onTextChange={vi.fn()}
        onRuntimeModeChange={vi.fn()}
        onModelSelectionChange={vi.fn()}
        images={[]}
        onPaste={vi.fn()}
        onDrop={vi.fn()}
        onImageRemove={vi.fn()}
        onInterrupt={vi.fn()}
      />,
    )

    expect(screen.queryByRole("button", { name: "Joindre une image" })).toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it("aligns staged image thumbnails to the left", () => {
    render(
      <ThreadComposer
        isRunning={false}
        disabled={false}
        text=""
        runtimeMode="full-access"
        models={cursorModels}
        modelSelection={null}
        error={undefined}
        onSubmit={vi.fn()}
        onTextChange={vi.fn()}
        onRuntimeModeChange={vi.fn()}
        onModelSelectionChange={vi.fn()}
        images={[
          {
            localId: "img-1",
            previewUrl: "blob:http://localhost/shot",
            upload: {
              type: "image",
              name: "shot.png",
              mimeType: "image/png",
              sizeBytes: 12,
              dataUrl: "data:image/png;base64,AAAA",
            },
          },
        ]}
        onPaste={vi.fn()}
        onDrop={vi.fn()}
        onImageRemove={vi.fn()}
        onInterrupt={vi.fn()}
      />,
    )

    const thumb = document.querySelector("[data-image-thumbnail]")
    expect(thumb).not.toBeNull()
    expect(thumb?.className).toMatch(/size-16/)
    expect(thumb?.parentElement?.className).toMatch(/w-full/)
    expect(thumb?.parentElement?.className).toMatch(/justify-start/)
    expect(screen.getByRole("button", { name: "Retirer shot.png" })).toBeTruthy()
  })

  it("expands a staged composer image and navigates the gallery", () => {
    const onImageRemove = vi.fn()
    render(
      <ThreadComposer
        isRunning={false}
        disabled={false}
        text=""
        runtimeMode="full-access"
        models={cursorModels}
        modelSelection={null}
        error={undefined}
        onSubmit={vi.fn()}
        onTextChange={vi.fn()}
        onRuntimeModeChange={vi.fn()}
        onModelSelectionChange={vi.fn()}
        images={[
          {
            localId: "img-1",
            previewUrl: "blob:http://localhost/shot",
            upload: {
              type: "image",
              name: "shot.png",
              mimeType: "image/png",
              sizeBytes: 12,
              dataUrl: "data:image/png;base64,AAAA",
            },
          },
          {
            localId: "img-2",
            previewUrl: "blob:http://localhost/diagram",
            upload: {
              type: "image",
              name: "diagram.png",
              mimeType: "image/png",
              sizeBytes: 8,
              dataUrl: "data:image/png;base64,BBBB",
            },
          },
        ]}
        onPaste={vi.fn()}
        onDrop={vi.fn()}
        onImageRemove={onImageRemove}
        onInterrupt={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Agrandir shot.png" }))
    expect(screen.getByRole("dialog", { name: "Aperçu agrandi" })).toBeTruthy()
    expect(screen.getByRole("img", { name: "shot.png" })).toBeTruthy()
    expect(screen.getByText("shot.png (1/2)")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Image suivante" }))
    expect(screen.getByRole("img", { name: "diagram.png" })).toBeTruthy()
    expect(screen.getByText("diagram.png (2/2)")).toBeTruthy()

    fireEvent.keyDown(window, { key: "ArrowLeft" })
    expect(screen.getByRole("img", { name: "shot.png" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Retirer shot.png" }))
    expect(onImageRemove).toHaveBeenCalledWith("img-1")
    expect(screen.getByRole("dialog", { name: "Aperçu agrandi" })).toBeTruthy()

    fireEvent.keyDown(window, { key: "Escape" })
    expect(screen.queryByRole("dialog", { name: "Aperçu agrandi" })).toBeNull()
  })

  it("centers the new-thread composer instead of docking it", () => {
    render(
      <ThreadComposer
        isRunning={false}
        disabled={false}
        text=""
        runtimeMode="full-access"
        models={cursorModels}
        modelSelection={null}
        placement="hero"
        error={undefined}
        onSubmit={vi.fn()}
        onTextChange={vi.fn()}
        onRuntimeModeChange={vi.fn()}
        onModelSelectionChange={vi.fn()}
        images={[]}
        onPaste={vi.fn()}
        onDrop={vi.fn()}
        onImageRemove={vi.fn()}
        onInterrupt={vi.fn()}
      />,
    )

    const composer = screen.getByRole("textbox", { name: "Composer un message" }).closest("form")
    expect(composer?.className).not.toMatch(/sticky/)
    expect(composer?.className).not.toMatch(/bottom-0/)
  })

  it("names the Project in a centered new-thread headline", () => {
    render(
      <ThreadDraftHero
        projectName="noyau"
        projects={[{ id: projectId, name: "noyau", available: true }]}
        selectedProjectId={projectId}
        onSelectProject={vi.fn()}
      >
        <div>composer</div>
      </ThreadDraftHero>,
    )

    const headline = screen.getByRole("heading", {
      name: "Qu’est-ce qu’on construit dans noyau ?",
    })
    expect(headline.tagName).toBe("H2")
    expect(headline.closest("[data-slot=thread-draft-hero]")?.className).toMatch(/justify-center/)
    expect(screen.queryByRole("button", { name: "noyau" })).toBeNull()
    const projectName = screen.getByText("noyau")
    expect(projectName.className).toMatch(/\binline\b/)
    expect(projectName.className).not.toMatch(/inline-block/)
    expect(projectName.className).not.toMatch(/truncate/)
  })

  it("changes Project from the new-thread headline when several are linked", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const user = userEvent.setup()
        const onSelectProject = vi.fn()
        const otherProjectId = ProjectId.make("10000000-0000-4000-8000-000000000002")
        render(
          <ThreadDraftHero
            projectName="noyau"
            projects={[
              { id: projectId, name: "noyau", available: true },
              { id: otherProjectId, name: "veto-sud", available: true },
            ]}
            selectedProjectId={projectId}
            onSelectProject={onSelectProject}
          >
            <div>composer</div>
          </ThreadDraftHero>,
        )

        const projectName = screen.getByRole("button", { name: "noyau" })
        expect(projectName.className).toMatch(/\binline\b/)
        expect(projectName.className).not.toMatch(/inline-block/)
        expect(projectName.className).not.toMatch(/truncate/)
        yield* Effect.promise(() => user.click(projectName))
        yield* Effect.promise(() =>
          user.click(screen.getByRole("menuitemradio", { name: "veto-sud" })),
        )
        expect(onSelectProject).toHaveBeenCalledWith(otherProjectId)
      }),
    ))

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
        images={[]}
        onPaste={vi.fn()}
        onDrop={vi.fn()}
        onImageRemove={vi.fn()}
        onInterrupt={vi.fn()}
      />,
    )

    const composer = screen.getByRole("textbox", { name: "Composer un message" })
    fireEvent.keyDown(composer, { key: "Enter", shiftKey: true })
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.keyDown(composer, { key: "Enter" })
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it("inserts an @ mention from the workspace path menu", async () => {
    const user = userEvent.setup()
    const searchPaths = vi.fn(() =>
      Promise.resolve([{ path: "src/adapter.ts", kind: "file" as const }]),
    )

    function Harness() {
      const [value, setValue] = useState("@ada")
      return (
        <ThreadComposer
          isRunning={false}
          disabled={false}
          text={value}
          runtimeMode="full-access"
          models={cursorModels}
          modelSelection={null}
          error={undefined}
          onSubmit={vi.fn()}
          onTextChange={setValue}
          onRuntimeModeChange={vi.fn()}
          onModelSelectionChange={vi.fn()}
          images={[]}
          onPaste={vi.fn()}
          onDrop={vi.fn()}
          onImageRemove={vi.fn()}
          onInterrupt={vi.fn()}
          searchPaths={searchPaths}
        />
      )
    }

    render(<Harness />)
    const option = await screen.findByRole("option", { name: /adapter\.ts/ })
    const listbox = screen.getByRole("listbox", { name: "Mentions" })
    const composerGroup = screen
      .getByRole("textbox", { name: "Composer un message" })
      .closest('[data-slot="input-group"]')
    expect(composerGroup?.contains(listbox)).toBe(false)
    expect(listbox.parentElement?.className).toMatch(/bottom-full/)
    expect(listbox.parentElement?.className).toMatch(/inset-x-6/)
    expect(listbox.parentElement?.className).toMatch(/rounded-t-xl/)
    expect(listbox.parentElement?.className).toMatch(/border-b-0/)
    expect(listbox.parentElement?.className).toMatch(/bg-background/)
    expect(listbox.parentElement?.className).not.toMatch(/bg-input/)
    expect(listbox.parentElement?.querySelector("[data-composer-path-fade]")).toBeNull()
    await user.click(option)
    expect(
      screen
        .getByRole("textbox", { name: "Composer un message" })
        .getAttribute("data-composer-value"),
    ).toBe("@src/adapter.ts ")
    const chip = document.querySelector("[data-composer-file-chip]")
    expect(chip?.textContent).toContain("adapter.ts")
    expect(chip?.querySelector("[data-pierre-icon]")).not.toBeNull()
  })

  it("inserts a ticket mention from the mention menu", async () => {
    const user = userEvent.setup()
    const mentionedTicketId = "40818da4-a4de-46f6-a60f-1aa305093a6e"

    function Harness() {
      const [value, setValue] = useState("@men")
      return (
        <ThreadComposer
          isRunning={false}
          disabled={false}
          text={value}
          runtimeMode="full-access"
          models={cursorModels}
          modelSelection={null}
          error={undefined}
          onSubmit={vi.fn()}
          onTextChange={setValue}
          onRuntimeModeChange={vi.fn()}
          onModelSelectionChange={vi.fn()}
          images={[]}
          onPaste={vi.fn()}
          onDrop={vi.fn()}
          onImageRemove={vi.fn()}
          onInterrupt={vi.fn()}
          tickets={[
            {
              ticketId: mentionedTicketId,
              title: "Mentioner ticket dans transcript",
              columnName: "En cours",
              done: false,
            },
          ]}
        />
      )
    }

    render(<Harness />)
    const option = await screen.findByRole("option", { name: /Mentioner ticket dans transcript/ })
    await user.click(option)
    expect(
      screen
        .getByRole("textbox", { name: "Composer un message" })
        .getAttribute("data-composer-value"),
    ).toBe(`@ticket:${mentionedTicketId} `)
    const chip = document.querySelector("[data-composer-ticket-chip]")
    expect(chip?.textContent).toContain("Mentioner ticket dans transcript")
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
            images={[]}
            onPaste={vi.fn()}
            onDrop={vi.fn()}
            onImageRemove={vi.fn()}
            onInterrupt={vi.fn()}
          />,
        )

        yield* Effect.promise(() =>
          user.click(screen.getByRole("button", { name: "Niveau d’accès" })),
        )
        const selectedMode = screen.getByRole("menuitemradio", { name: /Accès complet/ })
        expect(selectedMode.getAttribute("aria-checked")).toBe("true")
        expect(selectedMode.querySelector('[data-slot="menu-radio-item-indicator"]')).toBeNull()
        expect(selectedMode.querySelector(".lucide-lock-open")).not.toBeNull()
        expect(selectedMode.className).toMatch(/data-checked:bg-accent/)
        const modeDescription = screen.getByText(
          "Autorise les commandes et les éditions sans confirmation.",
        )
        expect(modeDescription.className).toMatch(/whitespace-nowrap/)
        expect(modeDescription.closest('[data-slot="menu-popup"]')?.className).toMatch(/w-max/)
        expect(
          screen
            .getByRole("menuitemradio", { name: /Approbation requise/ })
            .querySelector(".lucide-lock"),
        ).not.toBeNull()
        expect(
          screen
            .getByRole("menuitemradio", { name: /Accepter les éditions/ })
            .querySelector(".lucide-pen-line"),
        ).not.toBeNull()
        expect(
          screen
            .getByRole("menuitemradio", { name: /Automatique/ })
            .querySelector(".lucide-sparkles"),
        ).not.toBeNull()
        yield* Effect.promise(() =>
          user.click(screen.getByRole("menuitemradio", { name: /Approbation requise/ })),
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
            images={[]}
            onPaste={vi.fn()}
            onDrop={vi.fn()}
            onImageRemove={vi.fn()}
            onInterrupt={vi.fn()}
          />,
        )

        const modelTrigger = screen.getByRole("button", { name: "Modèle" })
        expect(modelTrigger.querySelector('[data-icon="inline-start"]')).toBeTruthy()
        yield* Effect.promise(() => user.click(modelTrigger))
        expect(screen.getByRole("combobox", { name: "Rechercher un modèle" })).toBeTruthy()
        expect(screen.getByText("Cursor")).toBeTruthy()
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
            images={[]}
            onPaste={vi.fn()}
            onDrop={vi.fn()}
            onImageRemove={vi.fn()}
            onInterrupt={vi.fn()}
          />,
        )
        expect(screen.getAllByRole("separator")).toHaveLength(2)
        const traitsTrigger = screen.getByRole("button", { name: "Configuration du modèle" })
        expect(traitsTrigger.textContent).toContain("Faible · Normal")
        yield* Effect.promise(() => user.click(traitsTrigger))
        expect(screen.queryByText("Effort automatique")).toBeNull()
        expect(screen.getByText("Niveau d’effort")).toBeTruthy()
        expect(screen.getByText("Service tier")).toBeTruthy()
        expect(screen.getAllByText("Par défaut")).toHaveLength(2)
        const tierDescription = screen.getByText("1,5× plus rapide, usage accru")
        expect(tierDescription.className).toMatch(/whitespace-nowrap/)
        expect(tierDescription.closest('[data-slot="menu-popup"]')?.className).toMatch(/w-max/)
        expect(
          screen.getByRole("menuitemradio", { name: /Faible/ }).getAttribute("aria-checked"),
        ).toBe("true")
        expect(
          screen.getByRole("menuitemradio", { name: /Normal/ }).getAttribute("aria-checked"),
        ).toBe("true")
        yield* Effect.promise(() =>
          user.click(screen.getByRole("menuitemradio", { name: "Élevé" })),
        )
        expect(onModelSelectionChange).toHaveBeenLastCalledWith({
          modelId: "composer-2.5",
          reasoningEffort: "high",
        })

        rerender(
          <ThreadComposer
            isRunning={false}
            disabled={false}
            text="Préparer la reprise"
            runtimeMode="full-access"
            models={cursorModels}
            modelSelection={{ modelId: "composer-2.5", reasoningEffort: "high" }}
            error={undefined}
            onSubmit={vi.fn()}
            onTextChange={vi.fn()}
            onRuntimeModeChange={vi.fn()}
            onModelSelectionChange={onModelSelectionChange}
            images={[]}
            onPaste={vi.fn()}
            onDrop={vi.fn()}
            onImageRemove={vi.fn()}
            onInterrupt={vi.fn()}
          />,
        )
        yield* Effect.promise(() =>
          user.click(screen.getByRole("button", { name: "Configuration du modèle" })),
        )
        yield* Effect.promise(() => user.click(screen.getByRole("menuitemradio", { name: /Fast/ })))
        expect(onModelSelectionChange).toHaveBeenLastCalledWith({
          modelId: "composer-2.5",
          reasoningEffort: "high",
          serviceTier: "fast",
        })
      }),
    ))

  it("shows Cursor thinking as reflection instead of an On/Off effort", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const user = userEvent.setup()
        const onModelSelectionChange = vi.fn()
        render(
          <ThreadComposer
            isRunning={false}
            disabled={false}
            text="Préparer la reprise"
            runtimeMode="full-access"
            models={[
              {
                ...cursorModels[0],
                reasoningEfforts: [],
                serviceTiers: [],
                thinking: { label: "Réflexion", defaultValue: true },
              },
            ]}
            modelSelection={{ modelId: "composer-2.5" }}
            error={undefined}
            onSubmit={vi.fn()}
            onTextChange={vi.fn()}
            onRuntimeModeChange={vi.fn()}
            onModelSelectionChange={onModelSelectionChange}
            images={[]}
            onPaste={vi.fn()}
            onDrop={vi.fn()}
            onImageRemove={vi.fn()}
            onInterrupt={vi.fn()}
          />,
        )

        const traitsTrigger = screen.getByRole("button", { name: "Configuration du modèle" })
        expect(traitsTrigger.textContent).toContain("Réflexion activée")
        yield* Effect.promise(() => user.click(traitsTrigger))
        expect(screen.queryByText("Niveau d’effort")).toBeNull()
        expect(screen.getByText("Réflexion")).toBeTruthy()
        expect(screen.getByRole("menuitemradio", { name: /Activée/ })).toBeTruthy()
        yield* Effect.promise(() =>
          user.click(screen.getByRole("menuitemradio", { name: "Désactivée" })),
        )
        expect(onModelSelectionChange).toHaveBeenLastCalledWith({
          modelId: "composer-2.5",
          thinking: false,
        })
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

  it("renders a tool call as a compact label, not a JSON dump", () => {
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
        draftAnswers={{}}
        legacyFreeform=""
        onDraftAnswersChange={vi.fn()}
        onLegacyFreeformChange={vi.fn()}
        onRespondApproval={vi.fn()}
        onRespondUserInput={vi.fn()}
      />,
    )

    expect(screen.getByText("Wrote file")).toBeTruthy()
    expect(screen.getByText("Wrote file").classList.contains("shimmer")).toBe(false)
    expect(screen.queryByText(/"content"/)).toBeNull()
    expect(screen.queryByText("Cursor tool")).toBeNull()
  })

  it("shows a workspace-relative path instead of Cursor tool", () => {
    const item = Schema.decodeSync(TranscriptItem)({
      _tag: "transcript.tool",
      threadId,
      turnId: TurnId.make("40000000-0000-4000-8000-000000000001"),
      toolCallId: "tool-1",
      name: "Cursor tool",
      status: "completed",
      outputSummary: "/Users/hezaerd/code/noyau/apps/web/src/index.ts",
    })

    render(
      <ThreadTranscriptItem
        item={item}
        streaming={false}
        workspaceRoot="/Users/hezaerd/code/noyau"
        draftAnswers={{}}
        legacyFreeform=""
        onDraftAnswersChange={vi.fn()}
        onLegacyFreeformChange={vi.fn()}
        onRespondApproval={vi.fn()}
        onRespondUserInput={vi.fn()}
      />,
    )

    expect(screen.getByText("noyau/apps/web/src/index.ts")).toBeTruthy()
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
        draftAnswers={{}}
        legacyFreeform=""
        onDraftAnswersChange={vi.fn()}
        onLegacyFreeformChange={vi.fn()}
        onRespondApproval={vi.fn()}
        onRespondUserInput={vi.fn()}
      />,
    )

    const label = screen.getByText("src/index.ts")
    expect(label.closest("p")?.classList.contains("shimmer")).toBe(true)
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
            draftByRequest={{}}
            legacyFreeformByRequest={{}}
            onDraftAnswersChange={vi.fn()}
            onLegacyFreeformChange={vi.fn()}
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

  it("keeps transcript chrome unselectable while message text stays copyable", () => {
    render(
      <ThreadTranscript
        transcript={[
          Schema.decodeSync(TranscriptItem)({
            _tag: "transcript.user",
            threadId,
            turnId: TurnId.make("40000000-0000-4000-8000-000000000001"),
            text: "Prompt copiable",
          }),
        ]}
        isRunning={false}
        loading={false}
        error={undefined}
        notices={null}
        draftByRequest={{}}
        legacyFreeformByRequest={{}}
        onDraftAnswersChange={vi.fn()}
        onLegacyFreeformChange={vi.fn()}
        onRespondApproval={vi.fn()}
        onRespondUserInput={vi.fn()}
      />,
    )

    const viewport = screen.getByLabelText("Transcript du Thread")
    expect(viewport.className).toContain("outline-none")
    expect(viewport.className).toContain("select-none")

    const item = viewport.querySelector("[data-slot='message-scroller-item']")
    expect(item?.className).toContain("select-text")
    expect(screen.getByText("Prompt copiable")).toBeTruthy()
  })

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
        draftByRequest={{}}
        legacyFreeformByRequest={{}}
        onDraftAnswersChange={vi.fn()}
        onLegacyFreeformChange={vi.fn()}
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
        draftByRequest={{}}
        legacyFreeformByRequest={{}}
        onDraftAnswersChange={vi.fn()}
        onLegacyFreeformChange={vi.fn()}
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

  it("renders Turn rail preview markdown and Shiki instead of raw markers", () => {
    const firstTurn = TurnId.make("40000000-0000-4000-8000-000000000001")
    const secondTurn = TurnId.make("40000000-0000-4000-8000-000000000002")
    const transcript = [
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
        text: "ensuite pour l'ui",
      }),
      Schema.decodeSync(TranscriptItem)({
        _tag: "transcript.assistant",
        threadId,
        turnId: secondTurn,
        text: "Le picker vit **dans** le composer.\n\n```ts\nconst ready = true\n```",
      }),
    ]

    return Effect.runPromise(
      Effect.gen(function* () {
        render(
          <ThreadTranscript
            transcript={transcript}
            isRunning={false}
            loading={false}
            error={undefined}
            notices={null}
            draftByRequest={{}}
            legacyFreeformByRequest={{}}
            onDraftAnswersChange={vi.fn()}
            onLegacyFreeformChange={vi.fn()}
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
        fireEvent.mouseMove(button, { clientY: 108 })

        const preview = rail.querySelector("[data-turn-minimap-preview]")
        expect(preview?.querySelector("[data-streamdown='strong']")?.textContent).toBe("dans")
        expect(preview?.textContent).not.toContain("**dans**")

        yield* Effect.promise(() =>
          waitFor(
            () => {
              const tokens = [
                ...(preview?.querySelectorAll(
                  "[data-streamdown='code-block-body'] span[style*='--sdm-c']",
                ) ?? []),
              ].filter((node): node is HTMLElement => node instanceof HTMLElement)
              expect(tokens.length).toBeGreaterThan(0)
              expect(
                tokens.some((node) => {
                  const light = node.style.getPropertyValue("--sdm-c")
                  const dark = node.style.getPropertyValue("--shiki-dark")
                  return (
                    light.length > 0 && light !== "inherit" && dark.length > 0 && light !== dark
                  )
                }),
              ).toBe(true)
            },
            { timeout: 5_000 },
          ),
        )
      }),
    )
  })

  it("shows a live working marker while the Turn is unsettled", () => {
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
        draftByRequest={{}}
        legacyFreeformByRequest={{}}
        onDraftAnswersChange={vi.fn()}
        onLegacyFreeformChange={vi.fn()}
        onRespondApproval={vi.fn()}
        onRespondUserInput={vi.fn()}
      />,
    )
    expect(waiting.getByRole("status").textContent).toMatch(/En cours/)
    waiting.unmount()

    render(
      <ThreadTranscript
        transcript={[user, assistant]}
        isRunning
        workingStartedAtMs={Date.parse("2026-08-23T12:00:00.000Z")}
        loading={false}
        error={undefined}
        notices={null}
        draftByRequest={{}}
        legacyFreeformByRequest={{}}
        onDraftAnswersChange={vi.fn()}
        onLegacyFreeformChange={vi.fn()}
        onRespondApproval={vi.fn()}
        onRespondUserInput={vi.fn()}
      />,
    )
    expect(screen.getByText("un")).toBeTruthy()
    expect(screen.getByRole("status").textContent).toMatch(/En cours depuis/)
  })

  it("labels a settled Turn with its elapsed duration", () => {
    const turnId = TurnId.make("40000000-0000-4000-8000-000000000001")
    render(
      <ThreadTranscript
        transcript={[
          Schema.decodeSync(TranscriptItem)({
            _tag: "transcript.user",
            threadId,
            turnId,
            text: "Ouvre le dossier",
          }),
        ]}
        isRunning={false}
        latestTurn={Schema.decodeSync(LatestTurn)({
          turnId,
          state: "completed",
          requestedAt: "2026-08-23T12:00:00.000Z",
          startedAt: "2026-08-23T12:00:00.000Z",
          completedAt: "2026-08-23T12:01:23.000Z",
        })}
        loading={false}
        error={undefined}
        notices={null}
        draftByRequest={{}}
        legacyFreeformByRequest={{}}
        onDraftAnswersChange={vi.fn()}
        onLegacyFreeformChange={vi.fn()}
        onRespondApproval={vi.fn()}
        onRespondUserInput={vi.fn()}
      />,
    )
    expect(screen.getByRole("status").textContent).toBe("A travaillé 1m 23s")
  })

  it("renders a presentation message instead of the raw fix-merge-conflicts prompt", () => {
    const item = Schema.decodeSync(TranscriptItem)({
      _tag: "transcript.user",
      threadId,
      turnId: TurnId.make("40000000-0000-4000-8000-000000000001"),
      text: "PR #12 conflicts with its base branch `main`.",
      presentation: "fix-merge-conflicts",
    })

    render(
      <ThreadTranscriptItem
        item={item}
        streaming={false}
        draftAnswers={{}}
        legacyFreeform=""
        onDraftAnswersChange={vi.fn()}
        onLegacyFreeformChange={vi.fn()}
        onRespondApproval={vi.fn()}
        onRespondUserInput={vi.fn()}
      />,
    )

    const label = screen.getByText("Fix merge conflicts")
    expect(label.closest("[data-slot=message]")?.getAttribute("data-align")).toBe("end")
    expect(label.closest("[data-slot=bubble]")).toBeTruthy()
    expect(screen.queryByText("PR #12 conflicts with its base branch `main`.")).toBeNull()
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
        draftAnswers={{}}
        legacyFreeform=""
        onDraftAnswersChange={vi.fn()}
        onLegacyFreeformChange={vi.fn()}
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
