import { Sequence } from "@noyau/protocol/ids"
import { Effect } from "effect"
import { describe, expect, it } from "vite-plus/test"

import { invalidInputFailure, type AppFailure } from "../src/lib/app-failure"
import {
  acceptsSequence,
  makeSequencedFrameConsumer,
  superviseSubscription,
  type SubscriptionStatus,
} from "../src/lib/control-plane"

describe("control plane stream cursor", () => {
  it("accepts each sequence once and ignores duplicate or older deliveries", () => {
    const first = Sequence.make(12)
    const duplicate = Sequence.make(12)
    const older = Sequence.make(11)
    const newer = Sequence.make(13)

    expect(acceptsSequence(undefined, first)).toBe(true)
    expect(acceptsSequence(first, duplicate)).toBe(false)
    expect(acceptsSequence(first, older)).toBe(false)
    expect(acceptsSequence(first, newer)).toBe(true)
  })

  it("requires the initial snapshot, then preserves ordering and dedup across attempts", () => {
    const accepted: Array<string> = []
    const consumer = makeSequencedFrameConsumer<
      { readonly snapshotSequence: Sequence; readonly label: string },
      { readonly sequence: Sequence; readonly label: string }
    >(undefined, {
      onSnapshot: (snapshot) => accepted.push(`snapshot:${snapshot.label}`),
      onEvent: (event) => accepted.push(`event:${event.label}`),
      onStatus: () => undefined,
    })

    consumer.consume({ kind: "event", event: { sequence: Sequence.make(9), label: "early" } })
    consumer.consume({
      kind: "snapshot",
      snapshot: { snapshotSequence: Sequence.make(10), label: "initial" },
    })
    consumer.consume({ kind: "event", event: { sequence: Sequence.make(11), label: "live" } })
    consumer.consume({ kind: "event", event: { sequence: Sequence.make(11), label: "duplicate" } })

    expect(accepted).toEqual(["snapshot:initial", "event:live"])
    expect(consumer.afterSequence()).toBe(11)
  })

  it("replaces a failed session and resubscribes from the last accepted global sequence", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        interface Session {
          readonly id: number
        }
        interface Attempt {
          readonly session: Session
          readonly afterSequence: Sequence | undefined
          readonly fail: (failure: AppFailure) => void
        }

        let session: Session = { id: 1 }
        let cursor: Sequence | undefined
        const attempts: Array<Attempt> = []
        const replaced: Array<number> = []
        const reconnects: Array<() => void> = []
        const statuses: Array<SubscriptionStatus> = []

        const stop = superviseSubscription<Session>({
          afterSequence: () => cursor,
          currentSession: () => session,
          startAttempt: (attemptSession, afterSequence, fail) => {
            attempts.push({ session: attemptSession, afterSequence, fail })
            return () => undefined
          },
          replaceSession: (failedSession) => {
            replaced.push(failedSession.id)
            if (session === failedSession) {
              session = { id: failedSession.id + 1 }
            }
            return Promise.resolve()
          },
          onStatus: (status) => statuses.push(status),
          schedule: (reconnect) => {
            reconnects.push(reconnect)
            return () => undefined
          },
        })

        cursor = Sequence.make(42)
        attempts[0]?.fail(invalidInputFailure("socket closed"))
        yield* Effect.promise(() => Promise.resolve())

        expect(replaced).toEqual([1])
        expect(statuses).toEqual([
          {
            _tag: "Reconnecting",
            attempt: 1,
            failure: invalidInputFailure("socket closed"),
          },
        ])
        expect(reconnects).toHaveLength(1)
        reconnects[0]?.()
        expect(attempts[1]).toMatchObject({
          session: { id: 2 },
          afterSequence: 42,
        })

        stop()
        attempts[1]?.fail(invalidInputFailure("ignored after stop"))
        expect(statuses).toHaveLength(1)
      }),
    ))
})
