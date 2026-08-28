// @vitest-environment happy-dom

import { EnvironmentId, ProjectId, ThreadId } from "@noyau/contracts/ids"
import { ShellSnapshot, ThreadShell } from "@noyau/contracts/shell"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Schema } from "effect"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { AppPaletteContext } from "../src/components/app-palette-context"
import { ThreadHeaderActions } from "../src/components/thread/ThreadHeaderActions"
import {
  AppAtomRegistryProvider,
  appAtomRegistry,
  resetAppAtomRegistryForTests,
} from "../src/state/atom-registry"
import { nowMinuteAtom } from "../src/state/now"
import { replaceAppliedShell, resetAppliedShell } from "../src/state/shell"

const dispatchThreadSettle = vi.hoisted(() => vi.fn())

vi.mock("../src/lib/thread-settle-actions", () => ({
  dispatchThreadSettle,
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
    environment: {
      id: EnvironmentId.make("30000000-0000-4000-8000-000000000001"),
      cursor: {
        installed: false,
        handshakeOk: false,
        version: null,
        plan: null,
        binaryPath: null,
        models: [],
      },
      claude: {
        installed: false,
        handshakeOk: false,
        version: null,
        plan: null,
        binaryPath: null,
        models: [],
      },
      codex: {
        installed: false,
        handshakeOk: false,
        version: null,
        plan: null,
        binaryPath: null,
        models: [],
      },
      createdAt: "2026-08-25T12:00:00.000Z",
    },
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

const paletteValue = { registerPageActions: () => () => undefined }
const nowMs = Date.parse("2026-08-25T12:00:00.000Z")

const renderHeader = (thread: ThreadShell) => {
  replaceAppliedShell(makeSnapshot([thread]))
  appAtomRegistry.set(nowMinuteAtom, nowMs)
  return render(
    <AppAtomRegistryProvider>
      <AppPaletteContext.Provider value={paletteValue}>
        <ThreadHeaderActions projectId={projectId} threadId={thread.id} disabled={false} />
      </AppPaletteContext.Provider>
    </AppAtomRegistryProvider>,
  )
}

afterEach(() => {
  cleanup()
  resetAppAtomRegistryForTests()
  resetAppliedShell()
  dispatchThreadSettle.mockClear()
})

describe("ThreadHeaderActions", () => {
  it("offers Settle on an active Thread", () => {
    const thread = makeThread()
    renderHeader(thread)

    fireEvent.click(screen.getByRole("button", { name: "Settle Thread" }))
    expect(dispatchThreadSettle).toHaveBeenCalledWith(thread, true)
  })

  it("does not offer Unsettle on a settled Thread", () => {
    renderHeader(
      makeThread({
        settledOverride: "settled",
        settledAt: "2026-08-24T12:00:00.000Z",
      }),
    )

    expect(screen.queryByRole("button", { name: "Unsettle Thread" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Settle Thread" })).toBeNull()
  })
})
