import { Environment, ProviderInstanceId } from "@noyau/contracts/entities/environment"
import { ProjectId, Sequence, ThreadId } from "@noyau/contracts/ids"
import { ShellSnapshot, ThreadShell } from "@noyau/contracts/shell"
import { Schema } from "effect"
import { afterEach, describe, expect, it } from "vite-plus/test"

import { applyShellEvent, makeOptimisticThreadShell } from "../src/lib/control-plane-state"
import { appAtomRegistry, resetAppAtomRegistryForTests } from "../src/state/atom-registry"
import { readComposerDraft, writeComposerDraft } from "../src/state/composer-drafts"
import {
  getAppliedShell,
  publishCreatedThread,
  reduceAppliedShellEvent,
  replaceAppliedShell,
  resetAppliedShell,
  threadIndexAtom,
  threadShellAtom,
  upsertAppliedShellThread,
} from "../src/state/shell"
import { encodedTestEnvironment } from "./encoded-environment"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")

const makeSnapshot = (sequence: number, threads: ReadonlyArray<ThreadShell> = []) => ({
  ...Schema.decodeSync(ShellSnapshot)({
    snapshotSequence: sequence,
    environment: encodedTestEnvironment(),
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
    modelSelection: null,
    runtimeMode: "full-access",
    status: "active",
    latestTurn: null,
    sessionStatus: null,
    lastError: null,
    createdAt: "2026-08-25T12:00:00.000Z",
    listedAt: "2026-08-25T12:00:00.000Z",
    updatedAt: "2026-08-25T12:00:00.000Z",
  })

afterEach(() => {
  resetAppAtomRegistryForTests()
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

  it("keeps the other Thread object identity when one is upserted", () => {
    const first = makeThread(threadId)
    const secondId = ThreadId.make("20000000-0000-4000-8000-000000000002")
    const second = makeThread(secondId)
    const current = makeSnapshot(10, [first, second])
    const updated: ThreadShell = { ...first, title: "Renommé" }

    const next = applyShellEvent(current, {
      _tag: "thread-upserted",
      sequence: Sequence.make(11),
      thread: updated,
    })

    expect(next.threads[0]).toBe(updated)
    expect(next.threads[1]).toBe(second)
  })

  it("applies environment-updated even when sequence is already in the snapshot", () => {
    const current = makeSnapshot(12)
    const cursorId = ProviderInstanceId.make("cursor")
    const environment = new Environment({
      id: current.environment.id,
      providers: {
        ...current.environment.providers,
        [cursorId]: {
          ...current.environment.providers[cursorId],
          enabled: false,
        },
      },
      createdAt: current.environment.createdAt,
    })
    const next = applyShellEvent(current, {
      _tag: "environment-updated",
      sequence: Sequence.make(0),
      environment,
    })

    expect(next.snapshotSequence).toBe(12)
    expect(next.environment.providers[cursorId]?.enabled).toBe(false)
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
    expect(appAtomRegistry.get(threadIndexAtom).threadsById.get(threadId)).toBe(thread)
  })
})

describe("upsertAppliedShellThread", () => {
  it("refuses an upsert before the first snapshot", () => {
    expect(upsertAppliedShellThread(makeThread(threadId))).toBe(false)
    expect(getAppliedShell()).toBeUndefined()
  })

  it("inserts a Thread without moving the stream cursor", () => {
    replaceAppliedShell(makeSnapshot(10))
    const thread = makeOptimisticThreadShell({
      id: threadId,
      projectId,
      title: "Fix sidebar ghost",
      runtimeMode: "full-access",
      branch: "main",
      createdAt: makeThread(threadId).createdAt,
    })

    expect(upsertAppliedShellThread(thread)).toBe(true)
    expect(getAppliedShell()?.threads).toEqual([thread])
    expect(getAppliedShell()?.snapshotSequence).toBe(10)
    expect(appAtomRegistry.get(threadIndexAtom).threadsById.get(threadId)).toBe(thread)
    expect(appAtomRegistry.get(threadShellAtom(threadId))).toBe(thread)
  })

  it("keeps the next live event applyable after an optimistic insert", () => {
    replaceAppliedShell(makeSnapshot(10))
    const optimistic = makeOptimisticThreadShell({
      id: threadId,
      projectId,
      title: "Nouveau thread",
      runtimeMode: "full-access",
    })
    upsertAppliedShellThread(optimistic)
    const authoritative = makeThread(threadId)

    expect(
      reduceAppliedShellEvent({
        _tag: "thread-upserted",
        sequence: Sequence.make(11),
        thread: authoritative,
      }),
    ).toBe(true)
    expect(getAppliedShell()?.threads).toEqual([authoritative])
    expect(getAppliedShell()?.snapshotSequence).toBe(11)
  })

  it("keeps the authoritative Thread when the receipt arrives after the live event", () => {
    replaceAppliedShell(makeSnapshot(10))
    const authoritative: ThreadShell = {
      ...makeThread(threadId),
      title: "Authoritative title",
      branch: "feat/live",
      worktreePath: "/tmp/wt",
    }
    expect(
      reduceAppliedShellEvent({
        _tag: "thread-upserted",
        sequence: Sequence.make(11),
        thread: authoritative,
      }),
    ).toBe(true)

    const optimistic = makeOptimisticThreadShell({
      id: threadId,
      projectId,
      title: "Nouveau thread",
      runtimeMode: "full-access",
      createdAt: makeThread(threadId).createdAt,
    })
    expect(upsertAppliedShellThread(optimistic)).toBe(true)
    expect(getAppliedShell()?.threads).toEqual([authoritative])
    expect(getAppliedShell()?.snapshotSequence).toBe(11)
  })

  it("omits an empty branch on the optimistic shell", () => {
    expect(
      makeOptimisticThreadShell({
        id: threadId,
        projectId,
        title: "Nouveau thread",
        runtimeMode: "full-access",
        branch: "   ",
        createdAt: makeThread(threadId).createdAt,
      }),
    ).not.toHaveProperty("branch")
  })
})

describe("publishCreatedThread", () => {
  it("upserts the optimistic shell and promotes the new-Thread Brouillon", () => {
    replaceAppliedShell(makeSnapshot(10))
    writeComposerDraft(projectId, undefined, "continue after create")
    const thread = makeOptimisticThreadShell({
      id: threadId,
      projectId,
      title: "Nouveau thread",
      runtimeMode: "full-access",
    })

    expect(publishCreatedThread(thread)).toBe(true)
    expect(getAppliedShell()?.threads).toEqual([thread])
    expect(readComposerDraft(projectId, undefined)).toBe("")
    expect(readComposerDraft(projectId, threadId)).toBe("continue after create")
  })
})
