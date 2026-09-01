import { ThreadSnapshot } from "@noyau/contracts/entities/thread-snapshot"
import { ProjectId, Sequence, ThreadId, TurnId } from "@noyau/contracts/ids"
import { ThreadShell } from "@noyau/contracts/shell"
import { Schema } from "effect"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import {
  resetThreadSnapshotPrefetchForTests,
  setThreadSnapshotPrefetchLoaderForTests,
} from "../src/lib/thread-snapshot-prefetch"
import { warmTerminalThreadSnapshot } from "../src/lib/thread-snapshot-shell-sync"
import { resetAppAtomRegistryForTests } from "../src/state/atom-registry"
import { getThreadSnapshot, replaceThreadSnapshot } from "../src/state/thread-snapshot"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const turnId = TurnId.make("30000000-0000-4000-8000-000000000001")

const latestTurn = {
  turnId,
  state: "completed" as const,
  requestedAt: "2026-08-19T12:00:00.000Z",
  startedAt: "2026-08-19T12:00:00.000Z",
  completedAt: "2026-08-19T12:01:00.000Z",
}

const makeSnapshot = (sequence: number, terminal: boolean): ThreadSnapshot =>
  Schema.decodeSync(ThreadSnapshot)({
    snapshotSequence: sequence,
    thread: {
      id: threadId,
      projectId,
      title: "Background Thread",
      provider: "cursor",
      runtimeMode: "auto",
      modelSelection: null,
      status: "active",
      session: null,
      latestTurn: terminal ? latestTurn : { ...latestTurn, state: "running", completedAt: null },
      createdAt: "2026-08-19T12:00:00.000Z",
      listedAt: "2026-08-19T12:00:00.000Z",
      updatedAt: "2026-08-19T12:01:00.000Z",
    },
    session: null,
    turns: [],
    transcript: [],
  })

const terminalShell = Schema.decodeSync(ThreadShell)({
  id: threadId,
  projectId,
  title: "Background Thread",
  provider: "cursor",
  runtimeMode: "auto",
  modelSelection: null,
  status: "active",
  sessionStatus: "ready",
  lastError: null,
  latestTurn,
  createdAt: "2026-08-19T12:00:00.000Z",
  listedAt: "2026-08-19T12:00:00.000Z",
  updatedAt: "2026-08-19T12:01:00.000Z",
})

afterEach(() => {
  resetThreadSnapshotPrefetchForTests()
  resetAppAtomRegistryForTests()
})

describe("warmTerminalThreadSnapshot", () => {
  it("refreshes a stale cached body when the shell reports Done", async () => {
    replaceThreadSnapshot(makeSnapshot(3, false))
    const load = vi.fn(() => Promise.resolve({ ok: true as const, value: makeSnapshot(8, true) }))
    setThreadSnapshotPrefetchLoaderForTests(load)

    expect(
      warmTerminalThreadSnapshot({
        _tag: "thread-upserted",
        sequence: Sequence.make(8),
        thread: terminalShell,
      }),
    ).toBe(true)
    await vi.waitFor(() => expect(getThreadSnapshot(threadId)?.snapshotSequence).toBe(8))

    expect(load).toHaveBeenCalledOnce()
    expect(load).toHaveBeenCalledWith(threadId)
  })

  it("does nothing when the cached body already contains the terminal Turn", () => {
    replaceThreadSnapshot(makeSnapshot(7, true))
    const load = vi.fn(() => Promise.resolve({ ok: true as const, value: makeSnapshot(8, true) }))
    setThreadSnapshotPrefetchLoaderForTests(load)

    expect(
      warmTerminalThreadSnapshot({
        _tag: "thread-upserted",
        sequence: Sequence.make(8),
        thread: terminalShell,
      }),
    ).toBe(false)
    expect(load).not.toHaveBeenCalled()
  })
})
