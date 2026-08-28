import { ThreadSnapshot } from "@noyau/contracts/entities/thread-snapshot"
import { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { Schema } from "effect"
import { afterEach, describe, expect, it } from "vite-plus/test"

import { resetAppAtomRegistryForTests } from "../src/state/atom-registry"
import {
  getThreadSnapshot,
  replaceThreadSnapshot,
  threadSnapshotNeedsLoad,
} from "../src/state/thread-snapshot"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")

const makeSnapshot = (threadId: string, sequence: number): ThreadSnapshot =>
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
      latestTurn: null,
      createdAt: "2026-08-19T12:00:00.000Z",
      updatedAt: "2026-08-19T12:00:00.000Z",
    },
    session: null,
    turns: [],
    transcript: [],
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
})
