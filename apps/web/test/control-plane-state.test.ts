import { EnvironmentId, ProjectId, Sequence, ThreadId } from "@noyau/protocol/ids"
import { ShellSnapshot, ThreadShell } from "@noyau/protocol/shell"
import { Schema } from "effect"
import { afterEach, describe, expect, it } from "vite-plus/test"

import {
  applyShellEvent,
  getAppliedShell,
  reduceAppliedShellEvent,
  replaceAppliedShell,
  resetAppliedShell,
} from "../src/lib/control-plane-state"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")

const makeSnapshot = (sequence: number, threads: ReadonlyArray<ThreadShell> = []) => ({
  ...Schema.decodeSync(ShellSnapshot)({
    snapshotSequence: sequence,
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
      createdAt: "2026-08-25T12:00:00.000Z",
    },
    projects: [],
    threads: [],
  }),
  threads,
})

const makeThread = (id: ThreadId): ThreadShell =>
  Schema.decodeSync(ThreadShell)({
    id,
    projectId,
    title: "Nouveau Thread",
    provider: "cursor",
    runtimeMode: "full-access",
    status: "active",
    latestTurn: null,
    sessionStatus: null,
    lastError: null,
    createdAt: "2026-08-25T12:00:00.000Z",
    updatedAt: "2026-08-25T12:00:00.000Z",
  })

afterEach(() => {
  resetAppliedShell()
})

describe("applyShellEvent", () => {
  it("upserts a Thread and advances snapshotSequence", () => {
    const thread = makeThread(threadId)
    const next = applyShellEvent(makeSnapshot(10), {
      _tag: "thread-upserted",
      sequence: Sequence.make(11),
      thread,
    })

    expect(next.snapshotSequence).toBe(11)
    expect(next.threads).toEqual([thread])
  })

  it("ignores a live event whose sequence is already in the snapshot", () => {
    const current = makeSnapshot(12, [makeThread(threadId)])
    const next = applyShellEvent(current, {
      _tag: "thread-removed",
      sequence: Sequence.make(12),
      threadId,
    })

    expect(next).toBe(current)
    expect(next.threads).toHaveLength(1)
  })
})

describe("reduceAppliedShellEvent", () => {
  it("refuses a live event before the first snapshot so the cursor can retry", () => {
    expect(
      reduceAppliedShellEvent({
        _tag: "thread-upserted",
        sequence: Sequence.make(1),
        thread: makeThread(threadId),
      }),
    ).toBe(false)
    expect(getAppliedShell()).toBeUndefined()
  })

  it("applies a live event onto the in-memory snapshot without waiting for React", () => {
    replaceAppliedShell(makeSnapshot(10))
    const thread = makeThread(threadId)

    expect(
      reduceAppliedShellEvent({
        _tag: "thread-upserted",
        sequence: Sequence.make(11),
        thread,
      }),
    ).toBe(true)
    expect(getAppliedShell()?.threads).toEqual([thread])
    expect(getAppliedShell()?.snapshotSequence).toBe(11)
  })
})
