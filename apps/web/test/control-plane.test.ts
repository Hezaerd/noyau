import { Sequence } from "@noyau/contracts/ids"
import { Effect } from "effect"
import { describe, expect, it } from "vite-plus/test"

import { invalidInputFailure, subscriptionEnded, type AppFailure } from "../src/lib/app-failure"
import {
  acceptsSequence,
  makeSequencedFrameConsumer,
  shouldRetryVcsStatus,
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
      onEvent: (event) => {
        accepted.push(`event:${event.label}`)
      },
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

  it("applies a side-channel event without moving the journal cursor", () => {
    const accepted: Array<string> = []
    const consumer = makeSequencedFrameConsumer<
      { readonly snapshotSequence: Sequence; readonly label: string },
      { readonly sequence: Sequence; readonly label: string; readonly side?: boolean }
    >(
      undefined,
      {
        onSnapshot: (snapshot) => accepted.push(`snapshot:${snapshot.label}`),
        onEvent: (event) => {
          accepted.push(`event:${event.label}`)
        },
        onStatus: () => undefined,
      },
      {
        isSideChannel: (event) => event.side === true,
      },
    )

    consumer.consume({
      kind: "snapshot",
      snapshot: { snapshotSequence: Sequence.make(10), label: "initial" },
    })
    consumer.consume({
      kind: "event",
      event: { sequence: Sequence.make(0), label: "keybindings", side: true },
    })
    consumer.consume({ kind: "event", event: { sequence: Sequence.make(11), label: "live" } })

    expect(accepted).toEqual(["snapshot:initial", "event:keybindings", "event:live"])
    expect(consumer.afterSequence()).toBe(11)
  })

  it("resumes from a warm afterSequence without waiting for a fresh snapshot", () => {
    const accepted: Array<string> = []
    const consumer = makeSequencedFrameConsumer<
      { readonly snapshotSequence: Sequence; readonly label: string },
      { readonly sequence: Sequence; readonly label: string }
    >(Sequence.make(10), {
      onSnapshot: (snapshot) => accepted.push(`snapshot:${snapshot.label}`),
      onEvent: (event) => {
        accepted.push(`event:${event.label}`)
      },
      onStatus: () => undefined,
    })

    consumer.consume({ kind: "event", event: { sequence: Sequence.make(10), label: "duplicate" } })
    consumer.consume({ kind: "event", event: { sequence: Sequence.make(11), label: "catch-up" } })
    consumer.consume({ kind: "event", event: { sequence: Sequence.make(12), label: "live" } })

    expect(accepted).toEqual(["event:catch-up", "event:live"])
    expect(consumer.afterSequence()).toBe(12)
  })

  it("does not advance the cursor when onEvent refuses the live item", () => {
    const accepted: Array<string> = []
    const consumer = makeSequencedFrameConsumer<
      { readonly snapshotSequence: Sequence; readonly label: string },
      { readonly sequence: Sequence; readonly label: string }
    >(undefined, {
      onSnapshot: (snapshot) => accepted.push(`snapshot:${snapshot.label}`),
      onEvent: (event) => {
        accepted.push(`event:${event.label}`)
        return event.label !== "hold"
      },
      onStatus: () => undefined,
    })

    consumer.consume({
      kind: "snapshot",
      snapshot: { snapshotSequence: Sequence.make(10), label: "initial" },
    })
    consumer.consume({ kind: "event", event: { sequence: Sequence.make(11), label: "hold" } })
    expect(consumer.afterSequence()).toBe(10)
    consumer.consume({ kind: "event", event: { sequence: Sequence.make(11), label: "hold" } })
    consumer.consume({ kind: "event", event: { sequence: Sequence.make(11), label: "live" } })

    expect(accepted).toEqual(["snapshot:initial", "event:hold", "event:hold", "event:live"])
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
        attempts[0]?.fail(subscriptionEnded())
        yield* Effect.promise(() => Promise.resolve())

        expect(replaced).toEqual([1])
        expect(statuses).toEqual([
          {
            _tag: "Reconnecting",
            attempt: 1,
            failure: subscriptionEnded(),
          },
        ])
        expect(reconnects).toHaveLength(1)
        reconnects[0]?.()
        expect(attempts[1]).toMatchObject({
          session: { id: 2 },
          afterSequence: 42,
        })

        stop()
        attempts[1]?.fail(subscriptionEnded())
        expect(statuses).toHaveLength(1)
      }),
    ))

  it("retries a domain stream failure without replacing the shared session", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        interface Session {
          readonly id: number
        }
        interface Attempt {
          readonly session: Session
          readonly fail: (failure: AppFailure) => void
        }

        let session: Session = { id: 1 }
        const attempts: Array<Attempt> = []
        const replaced: Array<number> = []
        const reconnects: Array<() => void> = []

        superviseSubscription<Session>({
          afterSequence: () => undefined,
          currentSession: () => session,
          startAttempt: (attemptSession, _afterSequence, fail) => {
            attempts.push({ session: attemptSession, fail })
            return () => undefined
          },
          replaceSession: (failedSession) => {
            replaced.push(failedSession.id)
            session = { id: failedSession.id + 1 }
            return Promise.resolve()
          },
          onStatus: () => undefined,
          schedule: (reconnect) => {
            reconnects.push(reconnect)
            return () => undefined
          },
        })

        attempts[0]?.fail(invalidInputFailure("fatal: not a git repository"))
        yield* Effect.promise(() => Promise.resolve())

        expect(replaced).toEqual([])
        expect(reconnects).toHaveLength(1)
        reconnects[0]?.()
        expect(attempts[1]?.session).toEqual({ id: 1 })
      }),
    ))

  it("stops retrying a deterministic VCS failure", () => {
    expect(shouldRetryVcsStatus(invalidInputFailure("ENOENT"))).toBe(false)
    expect(shouldRetryVcsStatus(subscriptionEnded())).toBe(true)
    expect(shouldRetryVcsStatus({ _tag: "Unavailable", service: "sqlite" })).toBe(true)

    interface Session {
      readonly id: number
    }
    const attempts: Array<Session> = []
    const replaced: Array<number> = []
    const reconnects: Array<() => void> = []
    let fail: ((failure: AppFailure) => void) | undefined

    superviseSubscription<Session>({
      afterSequence: () => undefined,
      currentSession: () => ({ id: 1 }),
      startAttempt: (session, _afterSequence, onFailure) => {
        attempts.push(session)
        fail = onFailure
        return () => undefined
      },
      replaceSession: (failedSession) => {
        replaced.push(failedSession.id)
        return Promise.resolve()
      },
      onStatus: () => undefined,
      shouldRetry: shouldRetryVcsStatus,
      schedule: (reconnect) => {
        reconnects.push(reconnect)
        return () => undefined
      },
    })

    fail?.(invalidInputFailure("fatal: not a git repository"))
    expect(replaced).toEqual([])
    expect(reconnects).toEqual([])
    expect(attempts).toHaveLength(1)
  })

  it("does not let a failing VCS stream replace the session of a healthy thread stream", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        interface Session {
          readonly id: number
        }
        const listeners = new Set<() => void>()
        let session: Session = { id: 1 }
        const threadAttempts: Array<Session> = []
        const vcsAttempts: Array<Session> = []
        const replaced: Array<number> = []
        const threadReconnects: Array<() => void> = []
        const vcsReconnects: Array<() => void> = []
        let failVcs: ((failure: AppFailure) => void) | undefined

        const replaceSession = (failedSession: Session): Promise<void> => {
          replaced.push(failedSession.id)
          if (session === failedSession) {
            session = { id: failedSession.id + 1 }
            for (const reconnect of listeners) {
              reconnect()
            }
          }
          return Promise.resolve()
        }

        const watchSessionReplacement = (reconnect: () => void): (() => void) => {
          listeners.add(reconnect)
          return () => {
            listeners.delete(reconnect)
          }
        }

        superviseSubscription<Session>({
          afterSequence: () => undefined,
          currentSession: () => session,
          startAttempt: (attemptSession, _afterSequence, _fail) => {
            threadAttempts.push(attemptSession)
            return () => undefined
          },
          replaceSession,
          watchSessionReplacement,
          onStatus: () => undefined,
          schedule: (reconnect) => {
            threadReconnects.push(reconnect)
            return () => undefined
          },
        })

        superviseSubscription<Session>({
          afterSequence: () => undefined,
          currentSession: () => session,
          startAttempt: (attemptSession, _afterSequence, onFailure) => {
            vcsAttempts.push(attemptSession)
            failVcs = onFailure
            return () => undefined
          },
          replaceSession,
          watchSessionReplacement,
          shouldRetry: shouldRetryVcsStatus,
          onStatus: () => undefined,
          schedule: (reconnect) => {
            vcsReconnects.push(reconnect)
            return () => undefined
          },
        })

        failVcs?.(invalidInputFailure("fatal: not a git repository"))
        yield* Effect.promise(() => Promise.resolve())

        expect(replaced).toEqual([])
        expect(threadAttempts).toEqual([{ id: 1 }])
        expect(vcsAttempts).toEqual([{ id: 1 }])
        expect(threadReconnects).toEqual([])
        expect(vcsReconnects).toEqual([])
      }),
    ))

  it("reconnects every active subscription when the shared session is actually replaced", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        interface Session {
          readonly id: number
        }
        const listeners = new Set<() => void>()
        let session: Session = { id: 1 }
        const threadAttempts: Array<Session> = []
        const vcsAttempts: Array<Session> = []
        const threadReconnects: Array<() => void> = []
        const vcsReconnects: Array<() => void> = []
        let failVcs: ((failure: AppFailure) => void) | undefined

        const replaceSession = (failedSession: Session): Promise<void> => {
          if (session === failedSession) {
            session = { id: failedSession.id + 1 }
            for (const reconnect of listeners) {
              reconnect()
            }
          }
          return Promise.resolve()
        }

        const watchSessionReplacement = (reconnect: () => void): (() => void) => {
          listeners.add(reconnect)
          return () => {
            listeners.delete(reconnect)
          }
        }

        superviseSubscription<Session>({
          afterSequence: () => undefined,
          currentSession: () => session,
          startAttempt: (attemptSession) => {
            threadAttempts.push(attemptSession)
            return () => undefined
          },
          replaceSession,
          watchSessionReplacement,
          onStatus: () => undefined,
          schedule: (reconnect) => {
            threadReconnects.push(reconnect)
            return () => undefined
          },
        })

        superviseSubscription<Session>({
          afterSequence: () => undefined,
          currentSession: () => session,
          startAttempt: (attemptSession, _afterSequence, onFailure) => {
            vcsAttempts.push(attemptSession)
            failVcs = onFailure
            return () => undefined
          },
          replaceSession,
          watchSessionReplacement,
          onStatus: () => undefined,
          schedule: (reconnect) => {
            vcsReconnects.push(reconnect)
            return () => undefined
          },
        })

        failVcs?.(subscriptionEnded())
        yield* Effect.promise(() => Promise.resolve())

        expect(threadReconnects).toHaveLength(1)
        expect(vcsReconnects).toHaveLength(1)
        threadReconnects[0]?.()
        vcsReconnects[0]?.()
        expect(threadAttempts[1]).toEqual({ id: 2 })
        expect(vcsAttempts[1]).toEqual({ id: 2 })
      }),
    ))
})
