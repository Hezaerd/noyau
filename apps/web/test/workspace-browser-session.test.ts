import { PreviewTabId, ThreadId } from "@noyau/contracts/ids"
import { PreviewSessionSnapshot } from "@noyau/contracts/preview"
import { Schema } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PREVIEW_TAB_GONE_MESSAGE } from "../src/lib/app-failure"
import {
  ensureWorkspaceBrowserSession,
  navigateWorkspaceBrowser,
  openWorkspaceBrowser,
  releaseRemovedWorkspaceBrowserSessions,
  releaseWorkspaceBrowserSession,
  resetWorkspaceBrowserBindingsForTests,
  workspaceBrowserQueueDepthForTests,
} from "../src/lib/workspace-browser"
import { resetAppAtomRegistryForTests } from "../src/state/atom-registry"
import { closeWorkspaceTab, getWorkspacePanel } from "../src/state/workspace-panel"

const { previewClose, previewNavigate, previewOpen } = vi.hoisted(() => ({
  previewClose: vi.fn(),
  previewNavigate: vi.fn(),
  previewOpen: vi.fn(),
}))

vi.mock("../src/lib/control-plane", () => ({
  previewClose,
  previewNavigate,
  previewOpen,
}))

const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")

const snapshot = (input: {
  readonly tabId: string
  readonly url?: string
}): PreviewSessionSnapshot =>
  Schema.decodeSync(PreviewSessionSnapshot)({
    tabId: input.tabId,
    threadId,
    navStatus:
      input.url === undefined
        ? { _tag: "Idle" }
        : { _tag: "Success", url: input.url, title: new URL(input.url).hostname },
    updatedAt: "2026-08-31T12:00:00.000Z",
  })

beforeEach(() => {
  previewOpen.mockReset()
  previewNavigate.mockReset()
  previewClose.mockReset()
  previewOpen.mockImplementation(
    async (input: { readonly threadId: ThreadId; readonly url?: string }) => ({
      ok: true,
      value: snapshot({
        tabId: "aaaaaaaa-0000-4000-8000-000000000001",
        url: input.url,
      }),
    }),
  )
  previewNavigate.mockImplementation(
    async (input: { readonly tabId: PreviewTabId; readonly url: string }) => ({
      ok: true,
      value: snapshot({ tabId: input.tabId, url: input.url }),
    }),
  )
  previewClose.mockResolvedValue({
    ok: true,
    value: { threadId, activeTabId: null },
  })
})

afterEach(() => {
  resetWorkspaceBrowserBindingsForTests()
  resetAppAtomRegistryForTests()
})

describe("workspace browser session", () => {
  it("opens a session once and reuses the binding", async () => {
    const tabId = openWorkspaceBrowser(threadId)
    const first = await ensureWorkspaceBrowserSession(threadId, tabId)
    const second = await ensureWorkspaceBrowserSession(threadId, tabId)

    expect(first).toEqual({
      ok: true,
      value: PreviewTabId.make("aaaaaaaa-0000-4000-8000-000000000001"),
    })
    expect(second).toEqual(first)
    expect(previewOpen).toHaveBeenCalledTimes(1)
    expect(previewOpen).toHaveBeenCalledWith({ threadId })
  })

  it("opens with the cached URL and writes the snapshot back", async () => {
    const tabId = openWorkspaceBrowser(threadId, "localhost:5173")
    await ensureWorkspaceBrowserSession(threadId, tabId)

    expect(previewOpen).toHaveBeenCalledWith({
      threadId,
      url: "http://localhost:5173/",
    })
    expect(getWorkspacePanel(threadId).tabs[0]?.payload).toEqual({
      url: "http://localhost:5173/",
    })
  })

  it("navigates through the bound session and updates the payload from the snapshot", async () => {
    const tabId = openWorkspaceBrowser(threadId)
    await ensureWorkspaceBrowserSession(threadId, tabId)
    const result = await navigateWorkspaceBrowser(threadId, tabId, "https://noyau.example/path")

    expect(result.ok).toBe(true)
    expect(previewNavigate).toHaveBeenCalledWith({
      threadId,
      tabId: PreviewTabId.make("aaaaaaaa-0000-4000-8000-000000000001"),
      url: "https://noyau.example/path",
    })
    expect(getWorkspacePanel(threadId).tabs[0]?.payload).toEqual({
      url: "https://noyau.example/path",
    })
  })

  it("reopens a session when navigate cannot find the tab", async () => {
    const tabId = openWorkspaceBrowser(threadId)
    await ensureWorkspaceBrowserSession(threadId, tabId)
    previewNavigate.mockResolvedValueOnce({
      ok: false,
      failure: { _tag: "InvalidInput", message: PREVIEW_TAB_GONE_MESSAGE },
    })
    previewOpen.mockResolvedValueOnce({
      ok: true,
      value: snapshot({
        tabId: "bbbbbbbb-0000-4000-8000-000000000002",
        url: "https://reopened.example/",
      }),
    })

    const result = await navigateWorkspaceBrowser(threadId, tabId, "https://reopened.example/")

    expect(result.ok).toBe(true)
    expect(previewOpen).toHaveBeenLastCalledWith({
      threadId,
      url: "https://reopened.example/",
    })
    expect(getWorkspacePanel(threadId).tabs[0]?.payload).toEqual({
      url: "https://reopened.example/",
    })
  })

  it("keeps the binding when navigate fails for another reason", async () => {
    const tabId = openWorkspaceBrowser(threadId)
    await ensureWorkspaceBrowserSession(threadId, tabId)
    previewNavigate.mockResolvedValueOnce({
      ok: false,
      failure: { _tag: "Unavailable", service: "preview" },
    })

    await expect(
      navigateWorkspaceBrowser(threadId, tabId, "https://noyau.example/"),
    ).resolves.toEqual({
      ok: false,
      failure: { _tag: "Unavailable", service: "preview" },
    })
    expect(previewOpen).toHaveBeenCalledTimes(1)
    previewNavigate.mockResolvedValueOnce({
      ok: true,
      value: snapshot({
        tabId: "aaaaaaaa-0000-4000-8000-000000000001",
        url: "https://noyau.example/",
      }),
    })
    await navigateWorkspaceBrowser(threadId, tabId, "https://noyau.example/")
    expect(previewNavigate).toHaveBeenLastCalledWith({
      threadId,
      tabId: PreviewTabId.make("aaaaaaaa-0000-4000-8000-000000000001"),
      url: "https://noyau.example/",
    })
  })

  it("drops a settled queue tail after the tab is released", async () => {
    const tabId = openWorkspaceBrowser(threadId)
    await ensureWorkspaceBrowserSession(threadId, tabId)
    await releaseWorkspaceBrowserSession(threadId, tabId)
    expect(workspaceBrowserQueueDepthForTests()).toBe(0)
  })

  it("closes the session when the client tab is gone before the snapshot lands", async () => {
    const tabId = openWorkspaceBrowser(threadId)
    previewOpen.mockImplementationOnce(async () => {
      closeWorkspaceTab(threadId, tabId)
      return {
        ok: true,
        value: snapshot({ tabId: "aaaaaaaa-0000-4000-8000-000000000001" }),
      }
    })

    await expect(ensureWorkspaceBrowserSession(threadId, tabId)).resolves.toEqual({
      ok: false,
      failure: { _tag: "Interrupted" },
    })
    expect(previewClose).toHaveBeenCalledWith({
      threadId,
      tabId: PreviewTabId.make("aaaaaaaa-0000-4000-8000-000000000001"),
    })
  })

  it("releases only removed browser tabs", async () => {
    const first = openWorkspaceBrowser(threadId)
    const second = openWorkspaceBrowser(threadId)
    await ensureWorkspaceBrowserSession(threadId, first)
    previewOpen.mockResolvedValueOnce({
      ok: true,
      value: snapshot({ tabId: "bbbbbbbb-0000-4000-8000-000000000002" }),
    })
    await ensureWorkspaceBrowserSession(threadId, second)
    const previous = getWorkspacePanel(threadId).tabs
    closeWorkspaceTab(threadId, first)
    await releaseRemovedWorkspaceBrowserSessions(
      threadId,
      previous,
      getWorkspacePanel(threadId).tabs,
    )

    expect(previewClose).toHaveBeenCalledTimes(1)
    expect(previewClose).toHaveBeenCalledWith({
      threadId,
      tabId: PreviewTabId.make("aaaaaaaa-0000-4000-8000-000000000001"),
    })
    await releaseWorkspaceBrowserSession(threadId, second)
    expect(previewClose).toHaveBeenCalledTimes(2)
  })
})
