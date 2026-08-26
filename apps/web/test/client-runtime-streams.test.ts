/**
 * Phase 0 characterization of current client stream behavior.
 *
 * These tests freeze today's production path in `makeSequencedFrameConsumer` and
 * `superviseSubscription` (`apps/web/src/lib/control-plane.ts`) before the
 * `@noyau/client-runtime` migration. They must not be weakened, and they do
 * not implement the future split « transport Connected » vs « Projection live ».
 *
 * See GitHub #272, `docs/roadmaps/client-runtime.md` Phase 0, ADR-0021.
 */
import type { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import { Forbidden, MissingIdentity, ServiceUnavailable } from "@noyau/protocol/errors"
import type { EventEnvelope } from "@noyau/protocol/events"
import { Sequence } from "@noyau/protocol/ids"
import type { ThreadStreamItem } from "@noyau/protocol/rpc"
import type { ThreadAssistantLive } from "@noyau/protocol/thread/live"
import { Cause, Effect } from "effect"
import { RpcClientError } from "effect/unstable/rpc/RpcClientError"
import { Socket } from "effect/unstable/socket"
import { afterEach, describe, expect, expectTypeOf, it } from "vite-plus/test"

import {
  invalidInputFailure,
  normalizeCause,
  subscriptionEnded,
  type AppFailure,
} from "../src/lib/app-failure"
import {
  makeSequencedFrameConsumer,
  superviseSubscription,
  type SubscriptionStatus,
} from "../src/lib/control-plane"
import { appAtomRegistry, resetAppAtomRegistryForTests } from "../src/state/atom-registry"
import {
  appliedShellAtom,
  getAppliedShell,
  resetAppliedShell,
  seedShellForTests,
  setSubscriptionStatus,
  shellSubscriptionStatus,
  subscriptionStatusAtom,
} from "../src/state/shell"
import {
  makeShellSnapshotFixture,
  makeThreadLiveFrame,
  makeThreadStreamHarness,
  STREAM_HARNESSES,
  type SharedSequencedFrame,
  type StreamHarness,
} from "./client-runtime-streams-fixtures"

const connected: SubscriptionStatus = { _tag: "Connected" }

const recordConsumer = (initialAfterSequence: Sequence | undefined) => {
  const snapshots: Array<Sequence> = []
  const events: Array<Sequence> = []
  const statuses: Array<SubscriptionStatus> = []
  const consumer = makeSequencedFrameConsumer(initialAfterSequence, {
    onSnapshot: (snapshot) => {
      snapshots.push(snapshot.snapshotSequence)
    },
    onEvent: (event) => {
      events.push(event.sequence)
    },
    onStatus: (status) => {
      statuses.push(status)
    },
  })
  return { consumer, snapshots, events, statuses }
}

interface SupervisorSession {
  readonly id: number
}

interface SupervisorAttempt {
  readonly session: SupervisorSession
  readonly afterSequence: Sequence | undefined
  readonly fail: (failure: AppFailure) => void
}

/**
 * Mirrors the reconnect test in `control-plane.test.ts`. Every subscribe*
 * (Shell, Project, Thread) uses this same `superviseSubscription` +
 * `startSubscriptionAttempt` path.
 */
const observeSupervisorFailure = (failure: AppFailure) =>
  Effect.gen(function* () {
    let session: SupervisorSession = { id: 1 }
    const attempts: Array<SupervisorAttempt> = []
    const replaced: Array<number> = []
    const reconnects: Array<() => void> = []
    const statuses: Array<SubscriptionStatus> = []

    const stop = superviseSubscription<SupervisorSession>({
      afterSequence: () => Sequence.make(7),
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
      onStatus: (status) => {
        statuses.push(status)
      },
      schedule: (reconnect) => {
        reconnects.push(reconnect)
        return () => undefined
      },
    })

    attempts[0]?.fail(failure)
    yield* Effect.promise(() => Promise.resolve())
    reconnects[0]?.()

    const nextAttempt = attempts[1]
    stop()
    attempts[1]?.fail(invalidInputFailure("ignored after stop"))

    return { replaced, statuses, reconnects, nextAttempt }
  })

const reconnectPathOf = (
  replaced: ReadonlyArray<number>,
  statuses: ReadonlyArray<SubscriptionStatus>,
  reconnectCount: number,
  nextAttempt: SupervisorAttempt | undefined,
) => ({
  replaced,
  statusTags: statuses.map((status) => status._tag),
  reconnects: reconnectCount,
  nextSessionId: nextAttempt?.session.id,
  nextAfterSequence: nextAttempt?.afterSequence,
})

/**
 * consumeThreadStream (not exported) handles `kind: "live"` before calling the
 * sequenced consumer. This replica documents that split.
 */
const routeThreadStreamItem = (
  item: ThreadStreamItem,
  consume: (frame: SharedSequencedFrame<ThreadSnapshot, EventEnvelope>) => void,
  onLive: (live: ThreadAssistantLive) => void,
): void => {
  if (item.kind === "live") {
    onLive(item.live)
    return
  }
  consume(item)
}

/**
 * ControlPlaneProvider dismisses the boot splash only when a Shell snapshot
 * exists or a *delayed* subscription failure appears — not on the first
 * Reconnecting tick (`useDelayedSubscriptionFailure`, 750ms).
 */
const providerWouldDismissSplash = (
  shell: ReturnType<typeof getAppliedShell>,
  delayedFailure: AppFailure | undefined,
): boolean => shell !== undefined || delayedFailure !== undefined

describe.each(STREAM_HARNESSES)("$name stream", (harness: StreamHarness) => {
  it("requires the initial snapshot, then accepts later events and advances the cursor", () => {
    const recorded = recordConsumer(undefined)

    recorded.consumer.consume(harness.eventFrame(9))
    expect(recorded.snapshots).toEqual([])
    expect(recorded.events).toEqual([])
    expect(recorded.consumer.afterSequence()).toBeUndefined()
    expect(recorded.statuses).toEqual([connected])

    recorded.consumer.consume(harness.snapshotFrame(10))
    recorded.consumer.consume(harness.eventFrame(11))

    expect(recorded.snapshots).toEqual([10])
    expect(recorded.events).toEqual([11])
    expect(recorded.consumer.afterSequence()).toBe(11)
    expect(recorded.statuses).toEqual([connected, connected, connected])
  })

  it("resumes from a warm afterSequence without waiting for a fresh snapshot", () => {
    const recorded = recordConsumer(Sequence.make(10))

    recorded.consumer.consume(harness.eventFrame(10))
    recorded.consumer.consume(harness.eventFrame(11))
    recorded.consumer.consume(harness.eventFrame(12))

    expect(recorded.snapshots).toEqual([])
    expect(recorded.events).toEqual([11, 12])
    expect(recorded.consumer.afterSequence()).toBe(12)
  })

  it("ignores older and duplicate events without extra snapshot or event callbacks", () => {
    const recorded = recordConsumer(undefined)

    recorded.consumer.consume(harness.snapshotFrame(10))
    recorded.consumer.consume(harness.eventFrame(11))
    const cursorAfterLive = recorded.consumer.afterSequence()
    const snapshotCount = recorded.snapshots.length
    const eventCount = recorded.events.length

    recorded.consumer.consume(harness.eventFrame(11))
    recorded.consumer.consume(harness.eventFrame(10))

    expect(recorded.snapshots).toHaveLength(snapshotCount)
    expect(recorded.events).toHaveLength(eventCount)
    expect(recorded.consumer.afterSequence()).toBe(cursorAfterLive)
    expect(recorded.snapshots).toEqual([10])
    expect(recorded.events).toEqual([11])
    expect(recorded.statuses).toEqual([connected, connected, connected, connected])
  })

  /**
   * Current `makeSequencedFrameConsumer` (do not "fix" this in Phase 0):
   *
   *   callbacks.onStatus({ _tag: "Connected" })
   *   if (item.kind === "synchronized") { return }
   *
   * Future runtime must split « transport Connected » vs « Projection live ».
   * `synchronized` today is not a live-phase marker.
   */
  it("treats synchronized as Connected transport only: no callbacks, no cursor, no live enable", () => {
    const recorded = recordConsumer(undefined)

    recorded.consumer.consume(harness.synchronizedFrame)

    expect(recorded.statuses).toEqual([connected])
    expect(recorded.snapshots).toEqual([])
    expect(recorded.events).toEqual([])
    expect(recorded.consumer.afterSequence()).toBeUndefined()

    recorded.consumer.consume(harness.eventFrame(11))

    expect(recorded.events).toEqual([])
    expect(recorded.consumer.afterSequence()).toBeUndefined()
    expect(recorded.statuses).toEqual([connected, connected])
  })

  it("does not use synchronized as a live-phase gate after a snapshot or warm cursor", () => {
    const afterSnapshot = recordConsumer(undefined)
    afterSnapshot.consumer.consume(harness.snapshotFrame(10))
    afterSnapshot.consumer.consume(harness.synchronizedFrame)
    afterSnapshot.consumer.consume(harness.eventFrame(11))

    expect(afterSnapshot.snapshots).toEqual([10])
    expect(afterSnapshot.events).toEqual([11])
    expect(afterSnapshot.consumer.afterSequence()).toBe(11)

    const warm = recordConsumer(Sequence.make(10))
    warm.consumer.consume(harness.synchronizedFrame)
    warm.consumer.consume(harness.eventFrame(11))

    expect(warm.snapshots).toEqual([])
    expect(warm.events).toEqual([11])
    expect(warm.consumer.afterSequence()).toBe(11)
  })

  it("treats a successful stream completion as a reconnectable TransportFailure", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        // startSubscriptionAttempt onSuccess → onFailure(subscriptionEnded()).
        // subscribeShell / subscribeProject / subscribeThread all share that path.
        const ended = subscriptionEnded()
        expect(ended).toEqual({
          _tag: "TransportFailure",
          phase: "stream",
          reason: "ended",
        })

        const outcome = yield* observeSupervisorFailure(ended)

        expect(outcome.replaced).toEqual([1])
        expect(outcome.statuses).toEqual([
          {
            _tag: "Reconnecting",
            attempt: 1,
            failure: ended,
          },
        ])
        expect(outcome.reconnects).toHaveLength(1)
        expect(outcome.nextAttempt).toMatchObject({
          session: { id: 2 },
          afterSequence: 7,
        })
      }),
    ))

  it("does not replace the transport session for a business error", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const business = yield* observeSupervisorFailure({ _tag: "Unauthorized" })
        const unavailable = yield* observeSupervisorFailure({
          _tag: "Unavailable",
          service: "control-plane",
        })
        const transport = yield* observeSupervisorFailure({
          _tag: "TransportFailure",
          phase: "stream",
          reason: "failed",
        })
        const ended = yield* observeSupervisorFailure(subscriptionEnded())
        const businessPath = {
          replaced: [],
          statusTags: ["Failed"],
          reconnects: 0,
          nextSessionId: undefined,
          nextAfterSequence: undefined,
        }
        const transportPath = {
          replaced: [1],
          statusTags: ["Reconnecting"],
          reconnects: 1,
          nextSessionId: 2,
          nextAfterSequence: 7,
        }

        expect(
          reconnectPathOf(
            business.replaced,
            business.statuses,
            business.reconnects.length,
            business.nextAttempt,
          ),
        ).toEqual(businessPath)
        expect(
          reconnectPathOf(
            unavailable.replaced,
            unavailable.statuses,
            unavailable.reconnects.length,
            unavailable.nextAttempt,
          ),
        ).toEqual(businessPath)
        expect(
          reconnectPathOf(
            transport.replaced,
            transport.statuses,
            transport.reconnects.length,
            transport.nextAttempt,
          ),
        ).toEqual(transportPath)
        expect(
          reconnectPathOf(
            ended.replaced,
            ended.statuses,
            ended.reconnects.length,
            ended.nextAttempt,
          ),
        ).toEqual(transportPath)
      }),
    ))
})

describe("thread live frames (outside makeSequencedFrameConsumer)", () => {
  it("keeps live off the sequenced consumer type", () => {
    type SequencedConsumeItem = Parameters<
      ReturnType<typeof makeSequencedFrameConsumer<ThreadSnapshot, EventEnvelope>>["consume"]
    >[0]

    expectTypeOf<SequencedConsumeItem["kind"]>().toEqualTypeOf<
      "snapshot" | "event" | "synchronized"
    >()
    expectTypeOf<ThreadStreamItem["kind"]>().toEqualTypeOf<
      "snapshot" | "event" | "synchronized" | "live"
    >()

    const liveOnly: Exclude<ThreadStreamItem["kind"], SequencedConsumeItem["kind"]> = "live"
    expect(liveOnly).toBe("live")
  })

  it("routes live frames around the sequenced consumer without advancing the cursor", () => {
    const recorded = recordConsumer(undefined)
    const lives: Array<string> = []
    const live = makeThreadLiveFrame()

    routeThreadStreamItem(live, recorded.consumer.consume, (item) => {
      lives.push(item.text)
    })

    expect(lives).toEqual(["hint"])
    expect(recorded.snapshots).toEqual([])
    expect(recorded.events).toEqual([])
    expect(recorded.statuses).toEqual([])
    expect(recorded.consumer.afterSequence()).toBeUndefined()

    const harness = makeThreadStreamHarness()
    routeThreadStreamItem(harness.snapshotFrame(10), recorded.consumer.consume, () => {
      lives.push("unexpected")
    })
    expect(recorded.snapshots).toEqual([10])
    expect(lives).toEqual(["hint"])
    expect(recorded.statuses).toEqual([connected])
  })
})

describe("stream error classification", () => {
  it("maps protocol business errors and transport defects through normalizeCause", () => {
    expect(normalizeCause(Cause.fail(new Forbidden()), "stream")).toEqual({ _tag: "Unauthorized" })
    expect(normalizeCause(Cause.fail(new MissingIdentity()), "stream")).toEqual({
      _tag: "Unauthorized",
    })
    expect(
      normalizeCause(Cause.fail(new ServiceUnavailable({ service: "sqlite" })), "stream"),
    ).toEqual({
      _tag: "Unavailable",
      service: "sqlite",
    })
    expect(subscriptionEnded()).toEqual({
      _tag: "TransportFailure",
      phase: "stream",
      reason: "ended",
    })

    const rpcTransport = new RpcClientError({
      reason: new Socket.SocketCloseError({
        code: 1006,
        closeReason: "socket closed",
      }),
    })
    expect(normalizeCause(Cause.fail(rpcTransport), "stream")).toEqual({
      _tag: "TransportFailure",
      phase: "stream",
      reason: "failed",
    })
  })
})

describe("boot and reconnect visible Shell state", () => {
  afterEach(() => {
    resetAppAtomRegistryForTests()
    resetAppliedShell()
  })

  it("starts with appliedShellAtom and subscriptionStatusAtom undefined", () => {
    expect(appAtomRegistry.get(appliedShellAtom)).toBeUndefined()
    expect(appAtomRegistry.get(subscriptionStatusAtom)).toBeUndefined()
    expect(getAppliedShell()).toBeUndefined()
    expect(providerWouldDismissSplash(getAppliedShell(), undefined)).toBe(false)
  })

  it("dismisses splash only when a snapshot exists or a delayed failure appears", () => {
    const delayed: AppFailure = {
      _tag: "TransportFailure",
      phase: "stream",
      reason: "failed",
    }

    expect(providerWouldDismissSplash(undefined, undefined)).toBe(false)
    expect(providerWouldDismissSplash(undefined, delayed)).toBe(true)

    seedShellForTests(makeShellSnapshotFixture(1))
    expect(providerWouldDismissSplash(getAppliedShell(), undefined)).toBe(true)
    expect(providerWouldDismissSplash(getAppliedShell(), delayed)).toBe(true)
  })

  it("keeps the Shell snapshot when subscription status becomes Reconnecting", () => {
    const snapshot = makeShellSnapshotFixture(4)
    seedShellForTests(snapshot)
    expect(getAppliedShell()).toBe(snapshot)

    setSubscriptionStatus({
      _tag: "Reconnecting",
      attempt: 1,
      failure: invalidInputFailure("socket closed"),
    })

    expect(getAppliedShell()).toBe(snapshot)
    expect(appAtomRegistry.get(appliedShellAtom)).toBe(snapshot)
    expect(appAtomRegistry.get(subscriptionStatusAtom)).toEqual({
      _tag: "Reconnecting",
      attempt: 1,
      failure: invalidInputFailure("socket closed"),
    })
    expect(providerWouldDismissSplash(getAppliedShell(), undefined)).toBe(true)
  })

  it("flips Connected ↔ Reconnecting without replacing the snapshot", () => {
    const snapshot = makeShellSnapshotFixture(5)
    seedShellForTests(snapshot)

    setSubscriptionStatus({ _tag: "Connected" })
    expect(getAppliedShell()).toBe(snapshot)
    expect(appAtomRegistry.get(subscriptionStatusAtom)).toEqual(connected)

    setSubscriptionStatus({
      _tag: "Reconnecting",
      attempt: 2,
      failure: subscriptionEnded(),
    })
    expect(getAppliedShell()).toBe(snapshot)
    expect(appAtomRegistry.get(subscriptionStatusAtom)?._tag).toBe("Reconnecting")

    setSubscriptionStatus({ _tag: "Connected" })
    expect(getAppliedShell()).toBe(snapshot)
    expect(appAtomRegistry.get(subscriptionStatusAtom)).toEqual(connected)
  })

  it("maps projection live to Connected and never treats synchronized as transport Connected", () => {
    const snapshot = makeShellSnapshotFixture(6)
    const live = { value: snapshot, phase: "live" as const, error: undefined }
    const synchronizing = {
      value: snapshot,
      phase: "synchronizing" as const,
      error: undefined,
    }
    const emptySync = {
      value: undefined,
      phase: "empty" as const,
      error: undefined,
    }

    expect(
      shellSubscriptionStatus(live, { phase: "connected", generation: 1, attempt: 0 }),
    ).toEqual(connected)
    expect(
      shellSubscriptionStatus(emptySync, { phase: "connected", generation: 1, attempt: 0 }),
    ).toBe(undefined)
    expect(
      shellSubscriptionStatus(synchronizing, { phase: "connected", generation: 2, attempt: 0 }),
    ).toEqual({ _tag: "Reconnecting", attempt: 1 })
    expect(
      shellSubscriptionStatus(live, { phase: "reconnecting", generation: 1, attempt: 1 })?._tag,
    ).toBe("Reconnecting")
    expect(shellSubscriptionStatus(synchronizing, undefined)).toEqual({
      _tag: "Reconnecting",
      attempt: 1,
    })
  })
})
