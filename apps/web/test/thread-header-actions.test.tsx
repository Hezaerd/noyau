// @vitest-environment happy-dom

import type { VcsStatusPullRequest } from "@noyau/contracts/git"
import { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { ShellSnapshot, ThreadShell } from "@noyau/contracts/shell"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Schema } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AppPaletteContext, type AppPaletteAction } from "../src/components/app-palette-context"
import { ThreadHeaderActions } from "../src/components/thread/ThreadHeaderActions"
import { TooltipProvider } from "../src/components/ui/tooltip"
import {
  AppAtomRegistryProvider,
  appAtomRegistry,
  resetAppAtomRegistryForTests,
} from "../src/state/atom-registry"
import {
  invokeKeybindingHandler,
  resetKeybindingHandlersForTests,
} from "../src/state/keybinding-handlers"
import { nowMinuteAtom } from "../src/state/now"
import { replaceAppliedShell, resetAppliedShell } from "../src/state/shell"
import { replaceProjectPullRequests } from "../src/state/sidebar"
import { encodedTestEnvironment } from "./encoded-environment"

const dispatchThreadSettle = vi.hoisted(() => vi.fn())
const dispatchThreadTitleRegenerate = vi.hoisted(() => vi.fn())
const copyPullRequestLink = vi.hoisted(() => vi.fn())

vi.mock("../src/lib/thread-settle-actions", () => ({
  dispatchThreadSettle,
}))

vi.mock("../src/lib/thread-title-actions", () => ({
  dispatchThreadTitleRegenerate,
}))

vi.mock("../src/lib/pull-request-actions", () => ({
  copyPullRequestLink,
}))

vi.mock("../src/components/thread/OpenInPicker", () => ({
  OpenInPicker: () => null,
}))

vi.mock("../src/components/thread/GitActionsControl", () => ({
  GitActionsControl: () => null,
}))

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")

const makeSnapshot = (threads: ReadonlyArray<ThreadShell>) => ({
  ...Schema.decodeSync(ShellSnapshot)({
    snapshotSequence: 1,
    environment: encodedTestEnvironment(),
    projects: [
      {
        id: projectId,
        name: "Noyau",
        workspaceRoot: "/tmp/noyau",
        defaultModelSelection: null,
        available: true,
        createdAt: "2026-08-25T12:00:00.000Z",
        updatedAt: "2026-08-25T12:00:00.000Z",
      },
    ],
    threads: [],
  }),
  threads,
})

const makeThread = (extra: Partial<(typeof ThreadShell)["Encoded"]> = {}): ThreadShell =>
  Schema.decodeSync(ThreadShell)({
    id: threadId,
    projectId,
    title: "Fix sidebar",
    provider: "cursor",
    runtimeMode: "full-access",
    modelSelection: null,
    status: "active",
    latestTurn: {
      turnId: "40000000-0000-4000-8000-000000000001",
      state: "completed",
      requestedAt: "2026-08-25T11:00:00.000Z",
      startedAt: "2026-08-25T11:00:00.000Z",
      completedAt: "2026-08-25T11:05:00.000Z",
    },
    sessionStatus: "ready",
    lastError: null,
    createdAt: "2026-08-20T12:00:00.000Z",
    listedAt: "2026-08-20T12:00:00.000Z",
    updatedAt: "2026-08-20T12:00:00.000Z",
    ...extra,
  })

const makePullRequest = (extra: Partial<VcsStatusPullRequest> = {}): VcsStatusPullRequest => ({
  number: 5,
  title: "Copy the PR link",
  url: "https://github.com/hezaerd/noyau/pull/5",
  baseRef: "main",
  headRef: "feature/copy-pr-link",
  state: "open",
  mergeability: "mergeable",
  ciStatus: "passing",
  failedChecks: [],
  ...extra,
})

const nowMs = Date.parse("2026-08-25T12:00:00.000Z")
const registeredPaletteActions: AppPaletteAction[] = []
const paletteValue = {
  registerPageActions: (actions: ReadonlyArray<AppPaletteAction>) => {
    registeredPaletteActions.splice(0, registeredPaletteActions.length, ...actions)
    return () => undefined
  },
}

const renderHeader = (thread: ThreadShell, disabled = false) => {
  registeredPaletteActions.length = 0
  replaceAppliedShell(makeSnapshot([thread]))
  appAtomRegistry.set(nowMinuteAtom, nowMs)
  return render(
    <AppAtomRegistryProvider>
      <TooltipProvider>
        <AppPaletteContext.Provider value={paletteValue}>
          <ThreadHeaderActions projectId={projectId} threadId={thread.id} disabled={disabled} />
        </AppPaletteContext.Provider>
      </TooltipProvider>
    </AppAtomRegistryProvider>,
  )
}

afterEach(() => {
  cleanup()
  resetAppAtomRegistryForTests()
  resetAppliedShell()
  resetKeybindingHandlersForTests()
  registeredPaletteActions.length = 0
  dispatchThreadSettle.mockClear()
  dispatchThreadTitleRegenerate.mockClear()
  copyPullRequestLink.mockClear()
})

describe("ThreadHeaderActions", () => {
  it("does not offer Settle in the header of an active Thread", () => {
    const thread = makeThread()
    renderHeader(thread)

    expect(screen.queryByRole("button", { name: "Settle Thread" })).toBeNull()
    const settle = registeredPaletteActions.find((action) => action.id === "thread.settle")
    expect(settle?.label).toBe("Settle Thread")
    void settle?.execute()
    expect(dispatchThreadSettle).toHaveBeenCalledWith(thread, true)
  })

  it("does not offer Unsettle in the header of a settled Thread", () => {
    const thread = makeThread({
      settledOverride: "settled",
      settledAt: "2026-08-24T12:00:00.000Z",
    })
    renderHeader(thread)

    expect(screen.queryByRole("button", { name: "Unsettle Thread" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Settle Thread" })).toBeNull()
    const settle = registeredPaletteActions.find((action) => action.id === "thread.settle")
    expect(settle?.label).toBe("Unsettle Thread")
    void settle?.execute()
    expect(dispatchThreadSettle).toHaveBeenCalledWith(thread, false)
  })

  it("offers the composer toggle in the header and the palette", () => {
    renderHeader(makeThread())

    expect(screen.getByRole("button", { name: "Hide composer" })).toBeTruthy()
    const toggle = registeredPaletteActions.find((action) => action.id === "thread.composer.toggle")
    expect(toggle?.label).toBe("Hide composer")
    fireEvent.click(screen.getByRole("button", { name: "Hide composer" }))
    expect(screen.getByRole("button", { name: "Show composer" })).toBeTruthy()
    expect(
      registeredPaletteActions.find((action) => action.id === "thread.composer.toggle")?.label,
    ).toBe("Show composer")
  })

  it("offers the workspace panel in the header and the palette", () => {
    renderHeader(makeThread())

    expect(screen.queryByRole("button", { name: "Open browser" })).toBeNull()
    const workspacePanelToggle = screen.getByRole("button", { name: "Show workspace panel" })
    expect(workspacePanelToggle).toBeTruthy()
    expect(
      workspacePanelToggle.closest("[data-slot='workspace-panel-toggle']")?.className,
    ).toContain("fixed")
    const toggle = registeredPaletteActions.find(
      (action) => action.id === "thread.workspace-panel.toggle",
    )
    expect(toggle?.label).toBe("Show workspace panel")
    const openBrowser = registeredPaletteActions.find(
      (action) => action.id === "thread.workspace-browser.open",
    )
    expect(openBrowser?.label).toBe("Open browser")
    const openPr = registeredPaletteActions.find(
      (action) => action.id === "thread.workspace-pr.open",
    )
    expect(openPr?.label).toBe("Open pull request")
  })

  it("offers title regeneration from the palette when the Thread has a Turn", () => {
    const thread = makeThread()
    renderHeader(thread)

    const regenerate = registeredPaletteActions.find(
      (action) => action.id === "thread.title.regenerate",
    )
    expect(regenerate?.label).toBe("Regenerate title")
    void regenerate?.execute()
    expect(dispatchThreadTitleRegenerate).toHaveBeenCalledWith(thread.id)
  })

  it("copies the link of an open pull request from the shortcut and Palette", () => {
    const pullRequest = makePullRequest()
    replaceProjectPullRequests(projectId, new Map([[threadId, pullRequest]]))
    renderHeader(makeThread())

    const copy = registeredPaletteActions.find(
      (action) => action.id === "thread.workspace-pr.copy-link",
    )
    expect(copy?.label).toBe("Copy pull request link")
    expect(copy?.shortcut).toBe("Mod+Shift+C")
    expect(invokeKeybindingHandler("thread.workspace-pr.copy-link")).toBe(true)
    void copy?.execute()
    expect(copyPullRequestLink).toHaveBeenCalledTimes(2)
    expect(copyPullRequestLink).toHaveBeenLastCalledWith(pullRequest.url)
  })

  it("does not offer or register the copy shortcut without an open pull request", () => {
    renderHeader(makeThread())

    expect(
      registeredPaletteActions.find((action) => action.id === "thread.workspace-pr.copy-link"),
    ).toBeUndefined()
    expect(invokeKeybindingHandler("thread.workspace-pr.copy-link")).toBe(false)
    expect(copyPullRequestLink).not.toHaveBeenCalled()
  })

  it("omits title regeneration from the palette before the first Turn", () => {
    renderHeader(makeThread({ latestTurn: null }))

    expect(
      registeredPaletteActions.find((action) => action.id === "thread.title.regenerate"),
    ).toBeUndefined()
  })

  it("omits the workspace panel palette action when the header is disabled", () => {
    renderHeader(makeThread(), true)

    expect(screen.getByRole("button", { name: "Hide composer" })).toHaveProperty("disabled", true)
    expect(screen.getByRole("button", { name: "Show workspace panel" })).toHaveProperty(
      "disabled",
      true,
    )
    expect(
      registeredPaletteActions.find((action) => action.id === "thread.composer.toggle"),
    ).toBeUndefined()
    expect(
      registeredPaletteActions.find((action) => action.id === "thread.workspace-panel.toggle"),
    ).toBeUndefined()
    expect(
      registeredPaletteActions.find((action) => action.id === "thread.workspace-browser.open"),
    ).toBeUndefined()
    expect(
      registeredPaletteActions.find((action) => action.id === "thread.workspace-pr.open"),
    ).toBeUndefined()
  })
})
