// @vitest-environment happy-dom

import { ThreadId } from "@noyau/contracts/ids"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { defineWorkspaceTab } from "../src/components/workspace-panel/define-workspace-tab"
import type { WorkspaceTabRenderContext } from "../src/components/workspace-panel/define-workspace-tab"
import { WorkspacePanel } from "../src/components/workspace-panel/WorkspacePanel"
import {
  appAtomRegistry,
  AppAtomRegistryProvider,
  resetAppAtomRegistryForTests,
} from "../src/state/atom-registry"
import {
  openWorkspaceTab,
  setWorkspacePanelOpen,
  workspacePanelWidthAtom,
} from "../src/state/workspace-panel"

const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const probe = defineWorkspaceTab({
  kind: "probe",
  label: "Probe",
  create: (tabId: string) => ({ tabId }),
  icon: () => <span>P</span>,
  render: ({ tab }: WorkspaceTabRenderContext) => <p>Surface {tab.id}</p>,
})

afterEach(() => {
  cleanup()
  resetAppAtomRegistryForTests()
  vi.unstubAllGlobals()
})

describe("WorkspacePanel resize handle", () => {
  it("coalesces pointer moves to the latest width per frame", () => {
    const frameCallbacks = new Map<number, FrameRequestCallback>()
    let nextFrameId = 1
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const frameId = nextFrameId
      nextFrameId += 1
      frameCallbacks.set(frameId, callback)
      return frameId
    })
    vi.stubGlobal("cancelAnimationFrame", (frameId: number) => {
      frameCallbacks.delete(frameId)
    })
    const widthUpdates = vi.fn()
    appAtomRegistry.subscribe(workspacePanelWidthAtom, widthUpdates)
    widthUpdates.mockClear()

    openWorkspaceTab(threadId, probe)
    setWorkspacePanelOpen(threadId, true)
    render(
      <AppAtomRegistryProvider>
        <WorkspacePanel kinds={[probe]} threadId={threadId} />
      </AppAtomRegistryProvider>,
    )
    widthUpdates.mockClear()

    const separator = screen.getByRole("separator", { name: "Resize workspace panel" })
    Object.defineProperty(separator, "setPointerCapture", { configurable: true, value: vi.fn() })
    fireEvent.pointerDown(separator, { pointerId: 7, clientX: 500 })
    fireEvent.pointerMove(separator, { pointerId: 7, clientX: 490 })
    fireEvent.pointerMove(separator, { pointerId: 7, clientX: 480 })
    fireEvent.pointerMove(separator, { pointerId: 7, clientX: 470 })

    expect(widthUpdates).not.toHaveBeenCalled()
    expect(frameCallbacks).toHaveLength(1)
    const frame = frameCallbacks.get(1)
    frameCallbacks.delete(1)
    frame?.(0)
    expect(widthUpdates).toHaveBeenCalledTimes(1)
    expect(appAtomRegistry.get(workspacePanelWidthAtom)).toBe(478)
  })

  it("flushes the latest clamped width on pointer up and ignores another pointer", () => {
    const frameCallbacks = new Map<number, FrameRequestCallback>()
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frameCallbacks.set(1, callback)
      return 1
    })
    vi.stubGlobal("cancelAnimationFrame", (frameId: number) => {
      frameCallbacks.delete(frameId)
    })
    const widthUpdates = vi.fn()
    appAtomRegistry.subscribe(workspacePanelWidthAtom, widthUpdates)
    widthUpdates.mockClear()

    openWorkspaceTab(threadId, probe)
    setWorkspacePanelOpen(threadId, true)
    render(
      <AppAtomRegistryProvider>
        <WorkspacePanel kinds={[probe]} threadId={threadId} />
      </AppAtomRegistryProvider>,
    )
    widthUpdates.mockClear()

    const separator = screen.getByRole("separator", { name: "Resize workspace panel" })
    Object.defineProperty(separator, "setPointerCapture", { configurable: true, value: vi.fn() })
    fireEvent.pointerDown(separator, { pointerId: 7, clientX: 500 })
    fireEvent.pointerDown(separator, { pointerId: 8, clientX: 100 })
    fireEvent.pointerMove(separator, { pointerId: 8, clientX: 1_000 })
    fireEvent.pointerMove(separator, { pointerId: 7, clientX: 1_000 })
    fireEvent.pointerUp(separator, { pointerId: 8 })

    expect(widthUpdates).not.toHaveBeenCalled()
    fireEvent.pointerUp(separator, { pointerId: 7 })
    expect(widthUpdates).toHaveBeenCalledTimes(1)
    expect(appAtomRegistry.get(workspacePanelWidthAtom)).toBe(320)
    expect(frameCallbacks).toHaveLength(0)
  })

  it("flushes on lost capture and cancels a pending frame on unmount", () => {
    const frameCallbacks = new Map<number, FrameRequestCallback>()
    let nextFrameId = 1
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const frameId = nextFrameId
      nextFrameId += 1
      frameCallbacks.set(frameId, callback)
      return frameId
    })
    vi.stubGlobal("cancelAnimationFrame", (frameId: number) => {
      frameCallbacks.delete(frameId)
    })
    const widthUpdates = vi.fn()
    appAtomRegistry.subscribe(workspacePanelWidthAtom, widthUpdates)
    widthUpdates.mockClear()

    openWorkspaceTab(threadId, probe)
    setWorkspacePanelOpen(threadId, true)
    const rendered = render(
      <AppAtomRegistryProvider>
        <WorkspacePanel kinds={[probe]} threadId={threadId} />
      </AppAtomRegistryProvider>,
    )
    widthUpdates.mockClear()

    const separator = screen.getByRole("separator", { name: "Resize workspace panel" })
    Object.defineProperty(separator, "setPointerCapture", { configurable: true, value: vi.fn() })
    fireEvent.pointerDown(separator, { pointerId: 7, clientX: 500 })
    fireEvent.pointerMove(separator, { pointerId: 7, clientX: 490 })
    fireEvent.lostPointerCapture(separator, { pointerId: 7 })

    expect(widthUpdates).toHaveBeenCalledTimes(1)
    expect(appAtomRegistry.get(workspacePanelWidthAtom)).toBe(458)
    expect(frameCallbacks).toHaveLength(0)

    fireEvent.pointerDown(separator, { pointerId: 9, clientX: 500 })
    fireEvent.pointerMove(separator, { pointerId: 9, clientX: 490 })
    const staleFrame = frameCallbacks.get(2)
    rendered.unmount()
    staleFrame?.(0)

    expect(widthUpdates).toHaveBeenCalledTimes(1)
    expect(frameCallbacks).toHaveLength(0)
  })
})
