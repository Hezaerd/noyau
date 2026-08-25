import type { ThreadId } from "@noyau/protocol/ids"
import type { ThreadAssistantLive } from "@noyau/protocol/thread/live"
import { Context, Duration, Effect, Layer, PubSub, Queue, Ref, Stream } from "effect"

export const THREAD_LIVE_COALESCE = Duration.millis(8)

export interface ThreadLiveService {
  readonly publish: (live: ThreadAssistantLive) => Effect.Effect<void>
  readonly clear: (threadId: ThreadId) => Effect.Effect<void>
  readonly subscribe: (threadId: ThreadId) => Stream.Stream<ThreadAssistantLive>
}

export class ThreadLive extends Context.Service<ThreadLive, ThreadLiveService>()(
  "@noyau/server/ThreadLive",
) {}

const makeThreadLive = Effect.gen(function* () {
  const pubsub = yield* Effect.acquireRelease(PubSub.unbounded<ThreadAssistantLive>(), (hub) =>
    PubSub.shutdown(hub),
  )
  const latest = yield* Ref.make(new Map<ThreadId, ThreadAssistantLive>())
  const scheduled = yield* Ref.make(new Set<ThreadId>())
  const dirty = yield* Queue.unbounded<ThreadId>()

  const flush = (threadId: ThreadId) =>
    Effect.gen(function* () {
      yield* Ref.update(scheduled, (ids) => {
        const next = new Set(ids)
        next.delete(threadId)
        return next
      })
      const live = (yield* Ref.get(latest)).get(threadId)
      if (live !== undefined) {
        yield* PubSub.publish(pubsub, live)
      }
    })

  yield* Effect.forkScoped(
    Queue.take(dirty).pipe(
      Effect.flatMap((threadId) =>
        Effect.sleep(THREAD_LIVE_COALESCE).pipe(Effect.andThen(flush(threadId))),
      ),
      Effect.forever,
    ),
    { startImmediately: true },
  )

  const publish: ThreadLiveService["publish"] = (live) =>
    Effect.gen(function* () {
      yield* Ref.update(latest, (map) => {
        const next = new Map(map)
        next.set(live.threadId, live)
        return next
      })
      const shouldSchedule = yield* Ref.modify(scheduled, (ids) => {
        if (ids.has(live.threadId)) {
          return [false, ids] as const
        }
        const next = new Set(ids)
        next.add(live.threadId)
        return [true, next] as const
      })
      if (shouldSchedule) {
        yield* Queue.offer(dirty, live.threadId)
      }
    })

  const clear: ThreadLiveService["clear"] = (threadId) =>
    Ref.update(latest, (map) => {
      const next = new Map(map)
      next.delete(threadId)
      return next
    }).pipe(
      Effect.andThen(
        Ref.update(scheduled, (ids) => {
          const next = new Set(ids)
          next.delete(threadId)
          return next
        }),
      ),
    )

  const subscribe: ThreadLiveService["subscribe"] = (threadId) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const seed = (yield* Ref.get(latest)).get(threadId)
        return Stream.concat(
          seed === undefined ? Stream.empty : Stream.succeed(seed),
          Stream.fromPubSub(pubsub).pipe(Stream.filter((live) => live.threadId === threadId)),
        )
      }),
    )

  return { publish, clear, subscribe } satisfies ThreadLiveService
})

export const threadLiveLayer = Layer.effect(ThreadLive, makeThreadLive)
