import { RpcSessionFactory, type RpcSession } from "@noyau/client-runtime/rpc"
import {
  Context,
  Effect,
  Exit,
  Layer,
  Option,
  Ref,
  Scope,
  Semaphore,
  Stream,
  SubscriptionRef,
} from "effect"

import {
  asTransportRupture,
  classifyControlPlaneError,
  connectionState,
  reconnectBackoffMs,
  TransportRupture,
  type ClassifyableControlPlaneError,
  type ConnectionState,
} from "./model.ts"

export {
  asTransportRupture,
  BusinessRpcError,
  classifyControlPlaneError,
  connectionState,
  reconnectBackoffMs,
  TransportRupture,
  type ClassifyableControlPlaneError,
  type ConnectionFailure,
  type ConnectionPhase,
  type ConnectionState,
  type ControlPlaneErrorClass,
} from "./model.ts"

export class ConnectionSupervisor extends Context.Service<
  ConnectionSupervisor,
  {
    readonly state: SubscriptionRef.SubscriptionRef<ConnectionState>
    readonly currentSession: Effect.Effect<RpcSession, TransportRupture>
    readonly notifyTransportRupture: (
      session: RpcSession,
      failure: TransportRupture,
    ) => Effect.Effect<void>
    readonly notifyFailure: (
      session: RpcSession,
      error: ClassifyableControlPlaneError,
    ) => Effect.Effect<void>
    readonly start: Effect.Effect<void>
    readonly stop: Effect.Effect<void>
  }
>()("@noyau/client-runtime/connection/supervisor/ConnectionSupervisor") {
  static layer: Layer.Layer<ConnectionSupervisor, never, RpcSessionFactory>
}

interface SupervisorGate {
  readonly started: boolean
  readonly stopped: boolean
  readonly replacing: boolean
}

const initialGate: SupervisorGate = {
  started: false,
  stopped: true,
  replacing: false,
}

const make = Effect.fn("ConnectionSupervisor.make")(function* () {
  const factory = yield* RpcSessionFactory
  const state = yield* SubscriptionRef.make(connectionState("connecting", 0, 0))
  const sessionRef = yield* Ref.make<RpcSession | undefined>(undefined)
  const generationRef = yield* Ref.make(0)
  const gate = yield* Ref.make(initialGate)
  const lifetime = yield* Ref.make<Scope.Closeable | undefined>(undefined)
  const transition = yield* Semaphore.make(1)

  const setState = (next: ConnectionState): Effect.Effect<void> => SubscriptionRef.set(state, next)

  const currentGeneration: Effect.Effect<number | undefined> = Effect.gen(function* () {
    const session = yield* Ref.get(sessionRef)
    return session?.generation
  })

  const interruptLifetime: Effect.Effect<void> = Effect.gen(function* () {
    const scope = yield* Ref.getAndSet(lifetime, undefined)
    if (scope !== undefined) {
      yield* Scope.close(scope, Exit.void)
    }
  })

  const ensureLifetime: Effect.Effect<Scope.Closeable> = Effect.gen(function* () {
    const existing = yield* Ref.get(lifetime)
    if (existing !== undefined) {
      return existing
    }
    const next = yield* Scope.make()
    yield* Ref.set(lifetime, next)
    return next
  })

  const currentSession: Effect.Effect<RpcSession, TransportRupture> = Stream.runHead(
    SubscriptionRef.changes(state).pipe(
      Stream.filter(
        (snapshot) => snapshot.phase === "connected" || snapshot.phase === "unavailable",
      ),
    ),
  ).pipe(
    Effect.flatMap((snapshot) => {
      if (Option.isNone(snapshot) || snapshot.value.phase === "unavailable") {
        return Effect.fail(new TransportRupture({ reason: "ended" }))
      }
      return Ref.get(sessionRef).pipe(
        Effect.flatMap((session) =>
          session === undefined
            ? Effect.fail(new TransportRupture({ reason: "failed" }))
            : Effect.succeed(session),
        ),
      )
    }),
  )

  const tryBeginReplace = (session: RpcSession): Effect.Effect<boolean> =>
    Effect.gen(function* () {
      const current = yield* currentGeneration
      return yield* Ref.modify(gate, (currentGate) => {
        if (currentGate.stopped || currentGate.replacing || current !== session.generation) {
          return [false, currentGate] as const
        }
        return [true, { ...currentGate, replacing: true }] as const
      })
    })

  const installSession = (session: RpcSession, nextGeneration: number): Effect.Effect<void> =>
    transition.withPermits(1)(
      Effect.gen(function* () {
        const afterConnect = yield* Ref.get(gate)
        if (afterConnect.stopped) {
          yield* session.dispose
          return
        }
        yield* Ref.set(sessionRef, session)
        yield* Ref.update(gate, (current) => ({ ...current, replacing: false }))
        yield* setState(connectionState("connected", nextGeneration, 0))
        const scope = yield* ensureLifetime
        yield* session.closed.pipe(
          Effect.matchEffect({
            onFailure: (rupture): Effect.Effect<void> => notifyTransportRupture(session, rupture),
            onSuccess: (): Effect.Effect<void> => Effect.void,
          }),
          Effect.forkIn(scope),
        )
      }),
    )

  const openSession = (): Effect.Effect<void> =>
    Effect.gen(function* () {
      const currentGate = yield* Ref.get(gate)
      if (currentGate.stopped) {
        return
      }
      const nextGeneration = yield* Ref.updateAndGet(generationRef, (generation) => generation + 1)
      const previous = yield* SubscriptionRef.get(state)
      const phase =
        previous.phase === "reconnecting" || previous.attempt > 0 ? "reconnecting" : "connecting"
      yield* setState(connectionState(phase, nextGeneration, previous.attempt, previous.failure))
      yield* factory.connect(nextGeneration).pipe(
        Effect.flatMap((opened) =>
          opened.ready.pipe(
            Effect.timeout("10 seconds"),
            Effect.catchTag("TimeoutError", () =>
              Effect.fail(new TransportRupture({ reason: "failed" })),
            ),
            Effect.onExit((exit) => (Exit.isSuccess(exit) ? Effect.void : opened.dispose)),
            Effect.as(opened),
          ),
        ),
        Effect.matchEffect({
          onFailure: (rupture): Effect.Effect<void> => scheduleReplace(rupture),
          onSuccess: (session): Effect.Effect<void> => installSession(session, nextGeneration),
        }),
      )
    }).pipe(Effect.withSpan("ConnectionSupervisor.openSession"))

  const scheduleReplace = (failure: TransportRupture): Effect.Effect<void> =>
    Effect.gen(function* () {
      const currentGate = yield* Ref.get(gate)
      if (currentGate.stopped) {
        yield* Ref.update(gate, (current) => ({ ...current, replacing: false }))
        return
      }
      const previous = yield* SubscriptionRef.get(state)
      const attempt = previous.attempt + 1
      yield* setState(connectionState("reconnecting", previous.generation, attempt, failure))
      const scope = yield* ensureLifetime
      yield* Effect.sleep(reconnectBackoffMs(attempt)).pipe(
        Effect.andThen(
          Effect.suspend((): Effect.Effect<void> =>
            Ref.get(gate).pipe(
              Effect.flatMap((next): Effect.Effect<void> => {
                if (next.stopped) {
                  return Ref.update(gate, (current) => ({ ...current, replacing: false }))
                }
                return openSession()
              }),
            ),
          ),
        ),
        Effect.forkIn(scope),
      )
    })

  const notifyTransportRupture = (
    session: RpcSession,
    failure: TransportRupture,
  ): Effect.Effect<void> =>
    Effect.gen(function* () {
      const accepted = yield* tryBeginReplace(session)
      if (!accepted) {
        return
      }
      yield* Ref.set(sessionRef, undefined)
      yield* session.dispose
      yield* scheduleReplace(failure)
    }).pipe(Effect.withSpan("ConnectionSupervisor.notifyTransportRupture"))

  const notifyFailure = (
    session: RpcSession,
    error: ClassifyableControlPlaneError,
  ): Effect.Effect<void> =>
    classifyControlPlaneError(error) === "transport"
      ? notifyTransportRupture(session, asTransportRupture(error))
      : Effect.void

  const start: Effect.Effect<void> = Effect.gen(function* () {
    const already = yield* Ref.modify(gate, (current) => {
      if (current.started && !current.stopped) {
        return [true, current] as const
      }
      return [false, { started: true, stopped: false, replacing: false }] as const
    })
    if (already) {
      return
    }
    yield* ensureLifetime
    yield* setState(connectionState("connecting", 0, 0))
    yield* openSession()
  }).pipe(Effect.withSpan("ConnectionSupervisor.start"))

  const stop: Effect.Effect<void> = Effect.gen(function* () {
    yield* transition.withPermits(1)(
      Effect.gen(function* () {
        yield* Ref.update(gate, (current) => ({
          ...current,
          started: false,
          stopped: true,
          replacing: false,
        }))
        const session = yield* Ref.getAndSet(sessionRef, undefined)
        if (session !== undefined) {
          yield* session.dispose
        }
        const previous = yield* SubscriptionRef.get(state)
        yield* setState(connectionState("unavailable", previous.generation, 0))
      }),
    )
    yield* interruptLifetime
  }).pipe(Effect.withSpan("ConnectionSupervisor.stop"))

  return ConnectionSupervisor.of({
    state,
    currentSession,
    notifyTransportRupture,
    notifyFailure,
    start,
    stop,
  })
})

export const layer: Layer.Layer<ConnectionSupervisor, never, RpcSessionFactory> = Layer.effect(
  ConnectionSupervisor,
  make(),
)
ConnectionSupervisor.layer = layer
