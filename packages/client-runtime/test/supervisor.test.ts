import { describe, expect, it } from "@effect/vitest"
import { ConnectionSupervisor, TransportRupture } from "@noyau/client-runtime/connection"
import { RpcSessionFactory } from "@noyau/client-runtime/rpc"
import { makeFakeRpcSession } from "@noyau/client-runtime/testing"
import { Forbidden } from "@noyau/protocol/errors"
import { Effect, Layer, SubscriptionRef } from "effect"
import { TestClock } from "effect/testing"

const makeRecordingFactory = () => {
  const connects: Array<number> = []
  const disposes: Array<number> = []
  const layer = Layer.succeed(RpcSessionFactory)({
    connect: (generation) =>
      Effect.sync(() => {
        connects.push(generation)
        return makeFakeRpcSession(generation, () => {
          disposes.push(generation)
        })
      }),
  })
  return { connects, disposes, layer }
}

const withSupervisor = <A, E>(
  recording: ReturnType<typeof makeRecordingFactory>,
  program: Effect.Effect<A, E, ConnectionSupervisor>,
): Effect.Effect<A, E> =>
  // oxlint-disable-next-line effecttsgo/strict-effect-provide -- test entry: fake factory per case
  program.pipe(Effect.provide(ConnectionSupervisor.layer.pipe(Layer.provide(recording.layer))))

const rupture = new TransportRupture({ reason: "ended" })

describe("ConnectionSupervisor", () => {
  it.effect("incrémente la génération à 1 puis 2", () =>
    Effect.gen(function* () {
      const recording = makeRecordingFactory()
      yield* withSupervisor(
        recording,
        Effect.gen(function* () {
          const supervisor = yield* ConnectionSupervisor
          yield* supervisor.start
          const first = yield* supervisor.currentSession
          expect(first.generation).toBe(1)
          expect((yield* SubscriptionRef.get(supervisor.state)).generation).toBe(1)
          yield* supervisor.notifyTransportRupture(first, rupture)
          yield* TestClock.adjust(100)
          yield* Effect.yieldNow
          const second = yield* supervisor.currentSession
          expect(second.generation).toBe(2)
          expect(second.generation).toBeGreaterThan(first.generation)
          expect(recording.connects).toEqual([1, 2])
          yield* supervisor.stop
        }),
      )
    }),
  )

  it.effect("coalesce dix ruptures parallèles en un seul remplacement", () =>
    Effect.gen(function* () {
      const recording = makeRecordingFactory()
      yield* withSupervisor(
        recording,
        Effect.gen(function* () {
          const supervisor = yield* ConnectionSupervisor
          yield* supervisor.start
          const session = yield* supervisor.currentSession
          expect(recording.connects).toEqual([1])
          yield* Effect.all(
            Array.from({ length: 10 }, () => supervisor.notifyTransportRupture(session, rupture)),
            { concurrency: "unbounded" },
          )
          expect(recording.connects).toEqual([1])
          expect(recording.disposes).toEqual([1])
          yield* TestClock.adjust(100)
          yield* Effect.yieldNow
          const replaced = yield* supervisor.currentSession
          expect(replaced.generation).toBe(2)
          expect(recording.connects).toEqual([1, 2])
          expect(recording.disposes).toEqual([1])
          yield* supervisor.stop
        }),
      )
    }),
  )

  it.effect("ne reconnecte pas après stop, y compris un retry déjà planifié", () =>
    Effect.gen(function* () {
      const recording = makeRecordingFactory()
      yield* withSupervisor(
        recording,
        Effect.gen(function* () {
          const supervisor = yield* ConnectionSupervisor
          yield* supervisor.start
          const session = yield* supervisor.currentSession
          yield* supervisor.notifyTransportRupture(session, rupture)
          yield* supervisor.stop
          yield* supervisor.notifyTransportRupture(session, rupture)
          yield* TestClock.adjust(2_000)
          yield* Effect.yieldNow
          expect(recording.connects).toEqual([1])
          expect((yield* SubscriptionRef.get(supervisor.state)).phase).toBe("unavailable")
        }),
      )
    }),
  )

  it.effect("dispose la session remplacée exactement une fois", () =>
    Effect.gen(function* () {
      const recording = makeRecordingFactory()
      yield* withSupervisor(
        recording,
        Effect.gen(function* () {
          const supervisor = yield* ConnectionSupervisor
          yield* supervisor.start
          const first = yield* supervisor.currentSession
          yield* first.dispose
          yield* supervisor.notifyTransportRupture(first, rupture)
          yield* TestClock.adjust(100)
          yield* Effect.yieldNow
          expect(recording.disposes).toEqual([1])
          const second = yield* supervisor.currentSession
          yield* supervisor.stop
          yield* second.dispose
          expect(recording.disposes).toEqual([1, 2])
        }),
      )
    }),
  )

  it.effect("attend 100 ms de backoff TestClock avant le premier retry", () =>
    Effect.gen(function* () {
      const recording = makeRecordingFactory()
      yield* withSupervisor(
        recording,
        Effect.gen(function* () {
          const supervisor = yield* ConnectionSupervisor
          yield* supervisor.start
          const session = yield* supervisor.currentSession
          yield* supervisor.notifyTransportRupture(session, rupture)
          yield* Effect.yieldNow
          expect(recording.connects).toEqual([1])
          yield* TestClock.adjust(99)
          yield* Effect.yieldNow
          expect(recording.connects).toEqual([1])
          yield* TestClock.adjust(1)
          yield* Effect.yieldNow
          expect(recording.connects).toEqual([1, 2])
          yield* supervisor.stop
        }),
      )
    }),
  )

  it.effect("n'ouvre pas une nouvelle session pour une erreur métier", () =>
    Effect.gen(function* () {
      const recording = makeRecordingFactory()
      yield* withSupervisor(
        recording,
        Effect.gen(function* () {
          const supervisor = yield* ConnectionSupervisor
          yield* supervisor.start
          const session = yield* supervisor.currentSession
          yield* supervisor.notifyFailure(session, new Forbidden())
          yield* TestClock.adjust(2_000)
          yield* Effect.yieldNow
          expect(recording.connects).toEqual([1])
          expect(recording.disposes).toEqual([])
          expect((yield* SubscriptionRef.get(supervisor.state)).phase).toBe("connected")
          yield* supervisor.stop
        }),
      )
    }),
  )
})
