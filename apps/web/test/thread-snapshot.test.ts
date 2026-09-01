import { ThreadSnapshot } from "@noyau/contracts/entities/thread-snapshot"
import { ProjectId, Sequence, ThreadId, TurnId } from "@noyau/contracts/ids"
import { ThreadShell } from "@noyau/contracts/shell"
import { Schema } from "effect"
import { afterEach, describe, expect, it } from "vite-plus/test"

import { resetAppAtomRegistryForTests } from "../src/state/atom-registry"
import {
  getThreadSnapshot,
  requireTerminalThreadSnapshot,
  replaceThreadSnapshot,
  threadSnapshotNeedsLoad,
  threadSnapshotResumeSequence,
} from "../src/state/thread-snapshot"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")

const turnId = TurnId.make("30000000-0000-4000-8000-000000000001")
const terminalLatestTurn = {
  turnId,
  state: "completed" as const,
  requestedAt: "2026-08-19T12:00:00.000Z",
  startedAt: "2026-08-19T12:00:00.000Z",
  completedAt: "2026-08-19T12:01:00.000Z",
}

const makeSnapshot = (
  threadId: string,
  sequence: number,
  latestTurn: (typeof ThreadSnapshot)["Encoded"]["thread"]["latestTurn"] = null,
): ThreadSnapshot =>
  Schema.decodeSync(ThreadSnapshot)({
    snapshotSequence: sequence,
    thread: {
      id: threadId,
      projectId,
      title: `Thread ${threadId}`,
      provider: "cursor",
      runtimeMode: "auto",
      modelSelection: null,
      status: "active",
      session: null,
      latestTurn,
      createdAt: "2026-08-19T12:00:00.000Z",
      listedAt: "2026-08-19T12:00:00.000Z",
      updatedAt: "2026-08-19T12:00:00.000Z",
    },
    session: null,
    turns: [],
    transcript: [],
  })

const terminalShell = Schema.decodeSync(ThreadShell)({
  id: "20000000-0000-4000-8000-000000000001",
  projectId,
  title: "Terminal Thread",
  provider: "cursor",
  runtimeMode: "auto",
  modelSelection: null,
  status: "active",
  sessionStatus: "ready",
  lastError: null,
  latestTurn: terminalLatestTurn,
  createdAt: "2026-08-19T12:00:00.000Z",
  listedAt: "2026-08-19T12:00:00.000Z",
  updatedAt: "2026-08-19T12:01:00.000Z",
})

afterEach(() => {
  resetAppAtomRegistryForTests()
})

describe("thread snapshot atom", () => {
  it("replaces the warm snapshot for a Thread", () => {
    const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
    replaceThreadSnapshot(makeSnapshot(threadId, 1))
    replaceThreadSnapshot(makeSnapshot(threadId, 2))

    expect(getThreadSnapshot(threadId)?.snapshotSequence).toBe(2)
  })

  it("keeps a newer snapshot when an older one lands late", () => {
    const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
    replaceThreadSnapshot(makeSnapshot(threadId, 5))
    expect(replaceThreadSnapshot(makeSnapshot(threadId, 2))).toBe(false)

    expect(getThreadSnapshot(threadId)?.snapshotSequence).toBe(5)
  })

  it("treats a draft or missing snapshot as needing a load", () => {
    const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
    expect(threadSnapshotNeedsLoad(undefined)).toBe(false)
    expect(threadSnapshotNeedsLoad(threadId)).toBe(true)
    replaceThreadSnapshot(makeSnapshot(threadId, 1))
    expect(threadSnapshotNeedsLoad(threadId)).toBe(false)
  })

  it("treats a warm snapshot behind a terminal shell event as stale", () => {
    const threadId = terminalShell.id
    replaceThreadSnapshot(
      makeSnapshot(threadId, 3, {
        ...terminalLatestTurn,
        state: "running",
        completedAt: null,
      }),
    )

    expect(requireTerminalThreadSnapshot(terminalShell, Sequence.make(8))).toBe(true)
    expect(threadSnapshotNeedsLoad(threadId)).toBe(true)
    expect(threadSnapshotResumeSequence(threadId)).toBeUndefined()

    replaceThreadSnapshot(makeSnapshot(threadId, 8, terminalLatestTurn))

    expect(threadSnapshotNeedsLoad(threadId)).toBe(false)
    expect(threadSnapshotResumeSequence(threadId)).toBe(8)
  })

  it("does not refresh a cache that already contains the terminal Turn", () => {
    const threadId = terminalShell.id
    replaceThreadSnapshot(makeSnapshot(threadId, 3, terminalLatestTurn))

    expect(requireTerminalThreadSnapshot(terminalShell, Sequence.make(8))).toBe(false)
    expect(threadSnapshotNeedsLoad(threadId)).toBe(false)
  })
})
