import { EnvironmentId, ProjectId, ThreadId, TurnId } from "@noyau/protocol/ids"
import { ShellSnapshot, ThreadShell } from "@noyau/protocol/shell"
import { Schema } from "effect"
import { afterEach, describe, expect, it } from "vite-plus/test"

import { appAtomRegistry, resetAppAtomRegistryForTests } from "../src/state/atom-registry"
import { nowMinuteAtom } from "../src/state/now"
import { replaceAppliedShell, resetAppliedShell } from "../src/state/shell"
import { sidebarQueuesAtom, threadActivityAtom, threadUnreadAtom } from "../src/state/sidebar"
import { pinAtom, setThreadPinned } from "../src/state/thread-pins"
import { markThreadVisited, visitAtom } from "../src/state/thread-visits"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const turnId = TurnId.make("40000000-0000-4000-8000-000000000001")

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
    latestTurn: null,
    sessionStatus: null,
    lastError: null,
    createdAt: "2026-08-20T12:00:00.000Z",
    updatedAt: "2026-08-20T12:00:00.000Z",
    ...extra,
  })

afterEach(() => {
  resetAppAtomRegistryForTests()
  resetAppliedShell()
})

describe("pinAtom / visitAtom", () => {
  it("exposes a Pin without rewriting the rest of the map", () => {
    const otherId = ThreadId.make("20000000-0000-4000-8000-000000000002")
    setThreadPinned(otherId, true, Date.parse("2026-08-25T10:00:00.000Z"))
    setThreadPinned(threadId, true, Date.parse("2026-08-25T11:00:00.000Z"))

    expect(appAtomRegistry.get(pinAtom(threadId))).toBe(true)
    expect(appAtomRegistry.get(pinAtom(otherId))).toBe(true)
  })

  it("records lastVisitedAt without moving it backwards", () => {
    markThreadVisited(threadId, Date.parse("2026-08-25T12:05:00.000Z"))
    markThreadVisited(threadId, Date.parse("2026-08-25T12:00:00.000Z"))

    expect(appAtomRegistry.get(visitAtom(threadId))).toBe(Date.parse("2026-08-25T12:05:00.000Z"))
  })
})

describe("threadUnreadAtom", () => {
  it("is unread only when completedAt is after lastVisitedAt", () => {
    replaceAppliedShell(
      makeSnapshot([
        makeThread({
          latestTurn: {
            turnId,
            state: "completed",
            requestedAt: "2026-08-25T12:00:00.000Z",
            startedAt: "2026-08-25T12:00:00.000Z",
            completedAt: "2026-08-25T12:10:00.000Z",
          },
        }),
      ]),
    )
    markThreadVisited(threadId, Date.parse("2026-08-25T12:05:00.000Z"))

    expect(appAtomRegistry.get(threadActivityAtom(threadId))?.kind).toBe("completed")
    expect(appAtomRegistry.get(threadUnreadAtom(threadId))).toBe(true)

    markThreadVisited(threadId, Date.parse("2026-08-25T12:11:00.000Z"))
    expect(appAtomRegistry.get(threadUnreadAtom(threadId))).toBe(false)
  })
})

describe("sidebarQueuesAtom", () => {
  it("keeps a pinned Thread in the active queue", () => {
    replaceAppliedShell(
      makeSnapshot([
        makeThread({
          settledOverride: "settled",
          settledAt: "2026-08-24T12:00:00.000Z",
        }),
      ]),
    )
    appAtomRegistry.set(nowMinuteAtom, Date.parse("2026-08-25T12:00:00.000Z"))
    setThreadPinned(threadId, true, Date.parse("2026-08-25T11:00:00.000Z"))

    const queues = appAtomRegistry.get(sidebarQueuesAtom(projectId))
    expect(queues.active.map((thread: ThreadShell) => thread.id)).toEqual([threadId])
    expect(queues.settled).toEqual([])
  })
})
