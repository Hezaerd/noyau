import { describe, expect, it } from "@effect/vitest"
import {
  applyShellEvent,
  applyShellResourceFrame,
  emptyRemoteResourceState,
  upsertOptimisticThread,
} from "@noyau/client-runtime/state/shell"
import { makeSequencedProjection } from "@noyau/client-runtime/state/stream"
import { Sequence, ThreadId } from "@noyau/protocol/ids"

import { makeShellSnapshot, makeThreadShell, THREAD_ID } from "./shell-fixtures.ts"

describe("applyShellEvent", () => {
  it("upserts a Thread and advances snapshotSequence", () => {
    const thread = makeThreadShell()
    const next = applyShellEvent(makeShellSnapshot(10), {
      _tag: "thread-upserted",
      sequence: Sequence.make(11),
      thread,
    })

    expect(next.snapshotSequence).toBe(11)
    expect(next.threads).toEqual([thread])
  })

  it("keeps the other Thread object identity when one is upserted", () => {
    const first = makeThreadShell()
    const second = makeThreadShell(ThreadId.make("20000000-0000-4000-8000-000000000002"))
    const current = makeShellSnapshot(10, [first, second])
    const updated = { ...first, title: "Renommé" }

    const next = applyShellEvent(current, {
      _tag: "thread-upserted",
      sequence: Sequence.make(11),
      thread: updated,
    })

    expect(next.threads[0]).toBe(updated)
    expect(next.threads[1]).toBe(second)
  })

  it("ignores a live event whose sequence is already in the snapshot", () => {
    const current = makeShellSnapshot(12, [makeThreadShell()])
    const next = applyShellEvent(current, {
      _tag: "thread-removed",
      sequence: Sequence.make(12),
      threadId: THREAD_ID,
    })

    expect(next).toBe(current)
    expect(next.threads).toHaveLength(1)
  })
})

describe("upsertOptimisticThread", () => {
  it("inserts a Thread without advancing snapshotSequence", () => {
    const snapshot = makeShellSnapshot(10)
    const thread = makeThreadShell()
    const next = upsertOptimisticThread(snapshot, thread)

    expect(next.threads).toEqual([thread])
    expect(next.snapshotSequence).toBe(10)
  })

  it("keeps the authoritative Thread when the id is already present", () => {
    const authoritative = { ...makeThreadShell(), title: "Authoritative" }
    const snapshot = makeShellSnapshot(11, [authoritative])
    const optimistic = { ...makeThreadShell(), title: "Nouveau thread" }

    expect(upsertOptimisticThread(snapshot, optimistic)).toBe(snapshot)
    expect(upsertOptimisticThread(snapshot, optimistic).threads).toEqual([authoritative])
  })
})

describe("applyShellResourceFrame", () => {
  it("passe empty → synchronizing sur snapshot, puis synchronized → live sans muter value", () => {
    const projection = makeSequencedProjection(undefined, { applyEvent: applyShellEvent })
    const snapshot = makeShellSnapshot(4)
    let resource = emptyRemoteResourceState<typeof snapshot>()

    resource = applyShellResourceFrame(resource, projection, {
      kind: "snapshot",
      snapshot,
    })
    expect(resource.phase).toBe("synchronizing")
    expect(resource.value).toBe(snapshot)
    expect(projection.afterSequence()).toBe(4)

    const beforeValue = resource.value
    resource = applyShellResourceFrame(resource, projection, { kind: "synchronized" })
    expect(resource.phase).toBe("live")
    expect(resource.value).toBe(beforeValue)
    expect(projection.afterSequence()).toBe(4)
  })

  it("laisse empty si synchronized arrive avant tout snapshot", () => {
    const projection = makeSequencedProjection(undefined, { applyEvent: applyShellEvent })
    const resource = applyShellResourceFrame(emptyRemoteResourceState(), projection, {
      kind: "synchronized",
    })

    expect(resource.phase).toBe("empty")
    expect(resource.value).toBeUndefined()
    expect(projection.afterSequence()).toBeUndefined()
  })

  it("applique un événement et ignore un doublon", () => {
    const projection = makeSequencedProjection(undefined, { applyEvent: applyShellEvent })
    const thread = makeThreadShell()
    let resource = applyShellResourceFrame(emptyRemoteResourceState(), projection, {
      kind: "snapshot",
      snapshot: makeShellSnapshot(10),
    })

    resource = applyShellResourceFrame(resource, projection, {
      kind: "event",
      event: {
        _tag: "thread-upserted",
        sequence: Sequence.make(11),
        thread,
      },
    })
    expect(resource.value?.threads).toEqual([thread])
    expect(projection.afterSequence()).toBe(11)

    const afterLive = resource
    resource = applyShellResourceFrame(resource, projection, {
      kind: "event",
      event: {
        _tag: "thread-removed",
        sequence: Sequence.make(11),
        threadId: THREAD_ID,
      },
    })
    expect(resource).toBe(afterLive)
    expect(projection.afterSequence()).toBe(11)
  })
})
