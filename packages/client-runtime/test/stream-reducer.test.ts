import { describe, expect, it } from "@effect/vitest"
import {
  acceptsSequence,
  makeSequencedProjection,
  reduceSequencedFrame,
  type SequencedEvent,
  type SequencedFrame,
  type SequencedSnapshot,
} from "@noyau/client-runtime/state/stream"
import { Sequence } from "@noyau/protocol/ids"

interface TestSnapshot extends SequencedSnapshot {
  readonly label: string
}

interface TestEvent extends SequencedEvent {
  readonly name: string
}

const seq = (value: number): Sequence => Sequence.make(value)

const snapshotFrame = (
  value: number,
  label = `snap-${value}`,
): SequencedFrame<TestSnapshot, TestEvent> => ({
  kind: "snapshot",
  snapshot: { snapshotSequence: seq(value), label },
})

const eventFrame = (
  value: number,
  name = `event-${value}`,
): SequencedFrame<TestSnapshot, TestEvent> => ({
  kind: "event",
  event: { sequence: seq(value), name },
})

const synchronizedFrame: SequencedFrame<TestSnapshot, TestEvent> = { kind: "synchronized" }

describe("acceptsSequence", () => {
  it("accepte le premier numéro et refuse un égal ou plus ancien", () => {
    expect(acceptsSequence(undefined, seq(0))).toBe(true)
    expect(acceptsSequence(seq(10), seq(11))).toBe(true)
    expect(acceptsSequence(seq(10), seq(10))).toBe(false)
    expect(acceptsSequence(seq(10), seq(9))).toBe(false)
  })
})

describe("reduceSequencedFrame — démarrage à froid", () => {
  it("ignore un événement avant snapshot et reste empty", () => {
    const projection = makeSequencedProjection<TestSnapshot, TestEvent>(undefined)
    const result = projection.consume(eventFrame(1))

    expect(result.accepted).toBe("ignored")
    expect(projection.phase()).toBe("empty")
    expect(projection.value()).toBeUndefined()
    expect(projection.afterSequence()).toBeUndefined()
  })

  it("passe à synchronizing après un snapshot, pas live", () => {
    const projection = makeSequencedProjection<TestSnapshot, TestEvent>(undefined)
    const frame = snapshotFrame(4, "board")
    const result = projection.consume(frame)

    expect(result.accepted).toBe("snapshot")
    expect(result.snapshot).toEqual({ snapshotSequence: seq(4), label: "board" })
    expect(projection.phase()).toBe("synchronizing")
    expect(projection.phase()).not.toBe("live")
    expect(projection.value()).toEqual({ snapshotSequence: seq(4), label: "board" })
    expect(projection.afterSequence()).toBe(seq(4))
  })

  it("n'active pas live si synchronized arrive avant tout snapshot", () => {
    const cold = {
      value: undefined,
      phase: "empty" as const,
      cursor: undefined,
    }
    const result = reduceSequencedFrame<TestSnapshot, TestEvent>(cold, synchronizedFrame)

    expect(result.accepted).toBe("ignored")
    expect(result.state.phase).toBe("empty")
    expect(result.state.value).toBeUndefined()
    expect(result.state.cursor).toBeUndefined()

    const projection = makeSequencedProjection<TestSnapshot, TestEvent>(undefined)
    projection.consume(synchronizedFrame)
    expect(projection.phase()).toBe("empty")
    expect(projection.value()).toBeUndefined()
    expect(projection.afterSequence()).toBeUndefined()
  })
})

describe("reduceSequencedFrame — synchronized après snapshot", () => {
  it("passe à live sans muter value ni cursor", () => {
    const projection = makeSequencedProjection<TestSnapshot, TestEvent>(undefined)
    projection.consume(snapshotFrame(7, "shell"))
    const beforeValue = projection.value()
    const beforeCursor = projection.afterSequence()

    const result = projection.consume(synchronizedFrame)

    expect(result.accepted).toBe("synchronized")
    expect(projection.phase()).toBe("live")
    expect(projection.value()).toBe(beforeValue)
    expect(projection.afterSequence()).toBe(beforeCursor)
    expect(projection.afterSequence()).toBe(seq(7))
  })
})

describe("reduceSequencedFrame — reprise chaude", () => {
  it("rattrape sans snapshot puis synchronized → live", () => {
    const projection = makeSequencedProjection<TestSnapshot, TestEvent>(seq(10))

    expect(projection.phase()).toBe("synchronizing")
    expect(projection.value()).toBeUndefined()
    expect(projection.afterSequence()).toBe(seq(10))

    const catchUp = projection.consume(eventFrame(12, "catch-up"))
    expect(catchUp.accepted).toBe("event")
    expect(catchUp.event?.name).toBe("catch-up")
    expect(projection.phase()).toBe("synchronizing")
    expect(projection.value()).toBeUndefined()
    expect(projection.afterSequence()).toBe(seq(12))

    const live = projection.consume(synchronizedFrame)
    expect(live.accepted).toBe("synchronized")
    expect(projection.phase()).toBe("live")
    expect(projection.value()).toBeUndefined()
    expect(projection.afterSequence()).toBe(seq(12))
  })
})

describe("reduceSequencedFrame — doublons et anciens", () => {
  it("ignore un événement plus ancien ou dupliqué", () => {
    const projection = makeSequencedProjection<TestSnapshot, TestEvent>(undefined)
    projection.consume(snapshotFrame(5))
    projection.consume(eventFrame(8))

    const duplicate = projection.consume(eventFrame(8, "dup"))
    const older = projection.consume(eventFrame(6, "old"))
    const olderSnapshot = projection.consume(snapshotFrame(4, "stale"))

    expect(duplicate.accepted).toBe("ignored")
    expect(older.accepted).toBe("ignored")
    expect(olderSnapshot.accepted).toBe("ignored")
    expect(projection.afterSequence()).toBe(seq(8))
    expect(projection.value()).toEqual({ snapshotSequence: seq(5), label: "snap-5" })
    expect(projection.phase()).toBe("synchronizing")
  })
})

describe("reduceSequencedFrame — applyEvent optionnel", () => {
  it("conserve value si applyEvent est omis", () => {
    const projection = makeSequencedProjection<TestSnapshot, TestEvent>(undefined)
    projection.consume(snapshotFrame(1, "kept"))
    const result = projection.consume(eventFrame(2))

    expect(result.accepted).toBe("event")
    expect(projection.value()).toEqual({ snapshotSequence: seq(1), label: "kept" })
  })

  it("applique applyEvent seulement quand une value existe", () => {
    const projection = makeSequencedProjection<TestSnapshot, TestEvent>(undefined, {
      applyEvent: (value, event) => ({
        snapshotSequence: value.snapshotSequence,
        label: `${value.label}+${event.name}`,
      }),
    })
    projection.consume(snapshotFrame(3, "base"))
    const applied = projection.consume(eventFrame(4, "delta"))

    expect(applied.accepted).toBe("event")
    expect(projection.value()).toEqual({ snapshotSequence: seq(3), label: "base+delta" })
    expect(projection.afterSequence()).toBe(seq(4))
  })

  it("n'appelle pas applyEvent pendant un catch-up sans value", () => {
    let calls = 0
    const projection = makeSequencedProjection<TestSnapshot, TestEvent>(seq(20), {
      applyEvent: (value) => {
        calls += 1
        return value
      },
    })
    const result = projection.consume(eventFrame(21))

    expect(result.accepted).toBe("event")
    expect(calls).toBe(0)
    expect(projection.value()).toBeUndefined()
  })
})
