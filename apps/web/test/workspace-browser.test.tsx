// @vitest-environment happy-dom

import { PreviewTabId, ThreadId } from "@noyau/contracts/ids"
import { PreviewSessionSnapshot } from "@noyau/contracts/preview"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Schema } from "effect"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { browserWorkspaceTab } from "../src/components/workspace-panel/browser-tab"
import { workspaceTabSanitizeKinds } from "../src/components/workspace-panel/catalog"
import { WorkspacePanel } from "../src/components/workspace-panel/WorkspacePanel"
import {
  openWorkspaceBrowser,
  resetWorkspaceBrowserBindingsForTests,
} from "../src/lib/workspace-browser"
import { parseWorkspacePanels, serializeWorkspacePanels } from "../src/lib/workspace-panel-persist"
import { AppAtomRegistryProvider, resetAppAtomRegistryForTests } from "../src/state/atom-registry"
import {
  getWorkspacePanel,
  openWorkspaceTab,
  setWorkspacePanelOpen,
} from "../src/state/workspace-panel"

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
  previewClose.mockResolvedValue({ ok: true, value: { threadId, activeTabId: null } })
})

afterEach(() => {
  cleanup()
  resetWorkspaceBrowserBindingsForTests()
  resetAppAtomRegistryForTests()
  Object.defineProperty(window, "noyauDesktop", {
    configurable: true,
    value: undefined,
  })
})

describe("workspace browser tab", () => {
  it("opens from the launcher and stays empty until a URL is submitted", async () => {
    const user = userEvent.setup()
    setWorkspacePanelOpen(threadId, true)
    render(
      <AppAtomRegistryProvider>
        <WorkspacePanel threadId={threadId} />
      </AppAtomRegistryProvider>,
    )

    await user.click(screen.getByRole("button", { name: "Browser" }))

    expect(screen.getByRole("tab", { name: "Browser" })).toBeTruthy()
    await waitFor(() => {
      expect(previewOpen).toHaveBeenCalledWith({ threadId })
    })
    expect(screen.getByText("Enter a URL to open a page.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Go back" })).toHaveProperty("disabled", true)
    expect(screen.getByRole("button", { name: "Reload" })).toHaveProperty("disabled", true)
  })

  it("persists a normalized URL and asks for the desktop app on the web client", async () => {
    const user = userEvent.setup()
    openWorkspaceTab(threadId, browserWorkspaceTab)
    setWorkspacePanelOpen(threadId, true)
    render(
      <AppAtomRegistryProvider>
        <WorkspacePanel threadId={threadId} />
      </AppAtomRegistryProvider>,
    )

    const address = screen.getByRole("textbox", { name: "Address" })
    await user.type(address, "localhost:5173")
    await user.keyboard("{Enter}")

    await waitFor(() => {
      expect(previewNavigate).toHaveBeenCalledWith({
        threadId,
        tabId: PreviewTabId.make("aaaaaaaa-0000-4000-8000-000000000001"),
        url: "http://localhost:5173/",
      })
    })
    expect(screen.getByRole("tab", { name: "localhost" })).toBeTruthy()
    expect(screen.getByText("The in-app browser runs in the desktop app.")).toBeTruthy()
    expect(screen.getByText("http://localhost:5173/")).toBeTruthy()
    expect(getWorkspacePanel(threadId).tabs[0]?.payload).toEqual({ url: "http://localhost:5173/" })
    expect(screen.getByRole("button", { name: "Reload" })).toHaveProperty("disabled", true)
  })

  it("reverts the address draft on Escape", async () => {
    const user = userEvent.setup()
    openWorkspaceTab(threadId, browserWorkspaceTab)
    setWorkspacePanelOpen(threadId, true)
    render(
      <AppAtomRegistryProvider>
        <WorkspacePanel threadId={threadId} />
      </AppAtomRegistryProvider>,
    )

    const address = screen.getByRole("textbox", { name: "Address" })
    await user.type(address, "localhost:5173")
    await user.keyboard("{Enter}")
    await waitFor(() => {
      expect(address).toHaveProperty("value", "http://localhost:5173/")
    })
    await user.clear(address)
    await user.type(address, "example.invalid")
    await user.keyboard("{Escape}")

    expect(address).toHaveProperty("value", "http://localhost:5173/")
    expect(address.getAttribute("aria-invalid")).toBeNull()
  })

  it("reserves a guest slot on the desktop runtime", async () => {
    Object.defineProperty(window, "noyauDesktop", {
      configurable: true,
      value: { appVersion: "0.0.0" },
    })
    openWorkspaceBrowser(threadId, "https://noyau.example")
    setWorkspacePanelOpen(threadId, true)
    render(
      <AppAtomRegistryProvider>
        <WorkspacePanel threadId={threadId} />
      </AppAtomRegistryProvider>,
    )

    await waitFor(() => {
      expect(previewOpen).toHaveBeenCalledWith({
        threadId,
        url: "https://noyau.example/",
      })
    })
    expect(document.querySelector("[data-slot=workspace-browser-guest]")).toBeTruthy()
    expect(document.querySelector("webview")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Reload" })).toHaveProperty("disabled", false)
  })

  it("keeps the guest mounted when the panel is hidden", async () => {
    Object.defineProperty(window, "noyauDesktop", {
      configurable: true,
      value: { appVersion: "0.0.0" },
    })
    openWorkspaceBrowser(threadId, "https://noyau.example")
    setWorkspacePanelOpen(threadId, true)
    render(
      <AppAtomRegistryProvider>
        <WorkspacePanel threadId={threadId} />
      </AppAtomRegistryProvider>,
    )
    await waitFor(() => {
      expect(document.querySelector("webview")).toBeTruthy()
    })

    setWorkspacePanelOpen(threadId, false)
    await waitFor(() => {
      expect(document.querySelector("[data-slot=workspace-panel]")?.className).toContain("hidden")
    })
    expect(document.querySelector("webview")).toBeTruthy()
    expect(previewOpen).toHaveBeenCalledTimes(1)
  })

  it("shows a load failure overlay on the desktop guest", async () => {
    Object.defineProperty(window, "noyauDesktop", {
      configurable: true,
      value: { appVersion: "0.0.0" },
    })
    openWorkspaceBrowser(threadId, "https://missing.example")
    setWorkspacePanelOpen(threadId, true)
    render(
      <AppAtomRegistryProvider>
        <WorkspacePanel threadId={threadId} />
      </AppAtomRegistryProvider>,
    )
    await waitFor(() => {
      expect(document.querySelector("webview")).toBeTruthy()
    })

    await waitFor(() => {
      document.querySelector("webview")?.dispatchEvent(
        Object.assign(new Event("did-fail-load"), {
          isMainFrame: true,
          errorCode: -105,
          errorDescription: "ERR_NAME_NOT_RESOLVED",
        }),
      )
      expect(screen.getByText("This page could not be loaded.")).toBeTruthy()
    })
    expect(screen.getByText("ERR_NAME_NOT_RESOLVED")).toBeTruthy()
  })

  it("commits an in-guest navigation through the preview session", async () => {
    Object.defineProperty(window, "noyauDesktop", {
      configurable: true,
      value: { appVersion: "0.0.0" },
    })
    openWorkspaceBrowser(threadId, "https://noyau.example")
    setWorkspacePanelOpen(threadId, true)
    render(
      <AppAtomRegistryProvider>
        <WorkspacePanel threadId={threadId} />
      </AppAtomRegistryProvider>,
    )
    await waitFor(() => {
      expect(previewOpen).toHaveBeenCalled()
      expect(document.querySelector("webview")).toBeTruthy()
    })

    await waitFor(() => {
      document.querySelector("webview")?.dispatchEvent(
        Object.assign(new Event("did-navigate"), {
          url: "https://noyau.example/docs",
        }),
      )
      expect(previewNavigate).toHaveBeenCalledWith({
        threadId,
        tabId: PreviewTabId.make("aaaaaaaa-0000-4000-8000-000000000001"),
        url: "https://noyau.example/docs",
      })
    })
  })

  it("marks invalid input without changing the payload", async () => {
    const user = userEvent.setup()
    openWorkspaceTab(threadId, browserWorkspaceTab)
    setWorkspacePanelOpen(threadId, true)
    render(
      <AppAtomRegistryProvider>
        <WorkspacePanel threadId={threadId} />
      </AppAtomRegistryProvider>,
    )

    const address = screen.getByRole("textbox", { name: "Address" })
    await user.type(address, "javascript:alert(1)")
    await user.keyboard("{Enter}")

    expect(address.getAttribute("aria-invalid")).toBe("true")
    expect(previewNavigate).not.toHaveBeenCalled()
    expect(getWorkspacePanel(threadId).tabs[0]?.payload).toEqual({ url: null })
    expect(screen.getByText("Enter a URL to open a page.")).toBeTruthy()
  })

  it("closes the preview session when the tab is closed", async () => {
    const user = userEvent.setup()
    openWorkspaceTab(threadId, browserWorkspaceTab)
    setWorkspacePanelOpen(threadId, true)
    render(
      <AppAtomRegistryProvider>
        <WorkspacePanel threadId={threadId} />
      </AppAtomRegistryProvider>,
    )

    await waitFor(() => {
      expect(previewOpen).toHaveBeenCalled()
    })
    await user.click(screen.getByRole("button", { name: "Close Browser" }))

    await waitFor(() => {
      expect(previewClose).toHaveBeenCalledWith({
        threadId,
        tabId: PreviewTabId.make("aaaaaaaa-0000-4000-8000-000000000001"),
      })
    })
    expect(screen.queryByRole("tab", { name: "Browser" })).toBeNull()
  })

  it("round-trips a browser tab through the registered catalogue", () => {
    openWorkspaceBrowser(threadId, "http://localhost:5173")
    const parsed = parseWorkspacePanels(
      serializeWorkspacePanels({
        [threadId]: getWorkspacePanel(threadId),
      }),
      workspaceTabSanitizeKinds,
    )

    expect(parsed[threadId]?.tabs[0]).toEqual({
      id: expect.any(String),
      kind: "browser",
      payload: { url: "http://localhost:5173/" },
      identity: null,
    })
  })
})
