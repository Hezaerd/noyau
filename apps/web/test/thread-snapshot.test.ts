import { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { Schema } from "effect"
import { afterEach, describe, expect, it } from "vite-plus/test"

import { resetAppAtomRegistryForTests } from "../src/state/atom-registry"
import { getThreadSnapshot, replaceThreadSnapshot } from "../src/state/thread-snapshot"

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
})
