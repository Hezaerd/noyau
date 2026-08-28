import { describe, expect, it } from "vite-plus/test"

import {
  activateWorkspaceTabInState,
  closeAllWorkspaceTabsInState,
  closeOtherWorkspaceTabsInState,
  closeWorkspaceTabInState,
  closeWorkspaceTabsToRightInState,
  defineWorkspaceTabKind,
  emptyWorkspacePanel,
  openWorkspaceTabInState,
  reconcileKeepMountedTabIds,
  resolveActiveWorkspaceTab,
  sanitizeWorkspacePanelState,
  setWorkspacePanelOpenInState,
  toggleWorkspacePanelInState,
  type WorkspacePanelState,
} from "../src/lib/workspace-panel"
import { parseWorkspacePanels, serializeWorkspacePanels } from "../src/lib/workspace-panel-persist"

const terminal = defineWorkspaceTabKind({
  kind: "terminal",
  label: "Terminal",
  keepMounted: true,
  create: (tabId: string) => ({ sessionId: tabId }),
})

const file = defineWorkspaceTabKind({
  kind: "file",
  label: "File",
  create: (_tabId: string, input: { readonly path: string }) => ({ path: input.path }),
  identityOf: (payload) => payload.path,
})

const kinds = new Set([terminal.kind, file.kind])

const openTerminal = (state: WorkspacePanelState, tabId: string): WorkspacePanelState =>
  openWorkspaceTabInState(state, terminal, tabId, undefined)

describe("workspace panel", () => {
  it("creates one tab per id and never reuses a kind as the identity", () => {
    const first = openTerminal(emptyWorkspacePanel, "tab-1")
    const second = openTerminal(first, "tab-2")

    expect(second.tabs.map((tab) => tab.id)).toEqual(["tab-1", "tab-2"])
    expect(second.tabs.map((tab) => tab.kind)).toEqual(["terminal", "terminal"])
    expect(second.tabs[0]?.payload).toEqual({ sessionId: "tab-1" })
    expect(second.tabs[1]?.payload).toEqual({ sessionId: "tab-2" })
    expect(second.activeTabId).toBe("tab-2")
    expect(second.open).toBe(true)
  })

  it("reuses a tab only when the kind opts into identity", () => {
    const first = openWorkspaceTabInState(emptyWorkspacePanel, file, "tab-1", {
      path: "src/a.ts",
    })
    const second = openWorkspaceTabInState(first, file, "tab-2", { path: "src/a.ts" })
    const third = openWorkspaceTabInState(second, file, "tab-3", { path: "src/b.ts" })

    expect(second.tabs).toHaveLength(1)
    expect(second.activeTabId).toBe("tab-1")
    expect(third.tabs.map((tab) => tab.id)).toEqual(["tab-1", "tab-3"])
  })

  it("keeps the launcher open after the last tab closes", () => {
    const opened = openTerminal(emptyWorkspacePanel, "tab-1")
    const closed = closeWorkspaceTabInState(opened, "tab-1")

    expect(closed).toEqual({ open: true, tabs: [], activeTabId: null })
    expect(resolveActiveWorkspaceTab(closed)).toBeNull()
  })

  it("hides the panel without destroying tabs", () => {
    const opened = openTerminal(emptyWorkspacePanel, "tab-1")
    const hidden = setWorkspacePanelOpenInState(opened, false)
    const shown = toggleWorkspacePanelInState(hidden)

    expect(hidden.open).toBe(false)
    expect(hidden.tabs).toHaveLength(1)
    expect(resolveActiveWorkspaceTab(hidden)).toBeNull()
    expect(shown.open).toBe(true)
    expect(shown.tabs).toHaveLength(1)
  })

  it("closes neighboring tabs and keeps the requested one", () => {
    const three = ["a", "b", "c"].reduce(openTerminal, emptyWorkspacePanel)
    const others = closeOtherWorkspaceTabsInState(three, "b")
    const toRight = closeWorkspaceTabsToRightInState(three, "a")
    const all = closeAllWorkspaceTabsInState(three)

    expect(others.tabs.map((tab) => tab.id)).toEqual(["b"])
    expect(toRight.tabs.map((tab) => tab.id)).toEqual(["a"])
    expect(all).toEqual({ open: true, tabs: [], activeTabId: null })
  })

  it("activates an existing tab and ignores unknown ids", () => {
    const opened = openTerminal(emptyWorkspacePanel, "tab-1")
    const second = openTerminal(opened, "tab-2")

    expect(activateWorkspaceTabInState(second, "tab-1").activeTabId).toBe("tab-1")
    expect(activateWorkspaceTabInState(second, "missing")).toBe(second)
  })

  it("keeps mounted live kinds and drops closed ones", () => {
    const two = openTerminal(openTerminal(emptyWorkspacePanel, "live"), "other")
    const kept = reconcileKeepMountedTabIds({
      previous: new Set(["live", "gone"]),
      tabs: two.tabs,
      activeTabId: "other",
      keepMountedKinds: new Set(["terminal"]),
    })

    expect(kept.has("live")).toBe(true)
    expect(kept.has("other")).toBe(true)
    expect(kept.size).toBe(2)
  })

  it("drops unknown kinds and corrupt payloads on sanitize", () => {
    const sanitized = sanitizeWorkspacePanelState(
      {
        open: true,
        activeTabId: "bad",
        tabs: [
          { id: "ok", kind: "terminal", payload: { sessionId: "ok" } },
          { id: "ghost", kind: "browser", payload: {} },
          { id: "broken", kind: "terminal", payload: { sessionId: { nested: true } } },
        ],
      },
      kinds,
    )

    expect(sanitized.tabs).toEqual([
      { id: "ok", kind: "terminal", payload: { sessionId: "ok" }, identity: null },
    ])
    expect(sanitized.activeTabId).toBe("ok")
  })

  it("round-trips persisted tabs for registered kinds only", () => {
    const opened = openTerminal(emptyWorkspacePanel, "tab-1")
    const parsed = parseWorkspacePanels(
      serializeWorkspacePanels({
        "20000000-0000-4000-8000-000000000001": opened,
        "not-a-uuid": opened,
      }),
      kinds,
    )

    expect(Object.keys(parsed)).toEqual(["20000000-0000-4000-8000-000000000001"])
    expect(parsed["20000000-0000-4000-8000-000000000001"]?.tabs[0]?.id).toBe("tab-1")
  })
})
