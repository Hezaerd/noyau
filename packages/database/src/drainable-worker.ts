import type { Scope } from "effect"
import { Effect, TxQueue, TxRef } from "effect"

export interface DrainableWorker<A> {
  readonly enqueue: (item: A) => Effect.Effect<void>
  readonly drain: Effect.Effect<void>
}

/**
 * Reactor éphémère adossé à une `TxQueue` mémoire. Chaque construction démarre
 * avec une file vide ; `drain` attend à la fois la file et le travail actif.
 */
export const makeDrainableWorker = <A, E, R>(
  process: (item: A) => Effect.Effect<void, E, R>,
): Effect.Effect<DrainableWorker<A>, never, Scope.Scope | R> =>
  Effect.gen(function* () {
    const queue = yield* Effect.acquireRelease(TxQueue.unbounded<A>(), TxQueue.shutdown)
    const outstanding = yield* TxRef.make(0)

    yield* TxQueue.take(queue).pipe(
      Effect.tap((item) =>
        process(item).pipe(
          Effect.catchCause((cause) => Effect.logError("TxQueue reactor failed", { cause })),
          Effect.ensuring(TxRef.update(outstanding, (count) => count - 1)),
        ),
      ),
      Effect.forever,
      Effect.forkScoped,
    )

    const enqueue = (item: A) =>
      TxQueue.offer(queue, item).pipe(
        Effect.tap(() => TxRef.update(outstanding, (count) => count + 1)),
        Effect.tx,
        Effect.asVoid,
      )

    const drain = TxRef.get(outstanding).pipe(
      Effect.tap((count) => (count > 0 ? Effect.txRetry : Effect.void)),
      Effect.tx,
    )

    return { enqueue, drain }
  })
