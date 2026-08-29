import type { GitCommandError, VcsStatusResult, VcsStatusStreamEvent } from "@noyau/contracts/git"
import {
  Context,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  PubSub,
  Ref,
  Scope,
  Stream,
  SynchronizedRef,
} from "effect"

import { GitRuntime, unavailableVcsStatus } from "./git-runtime.ts"

/** Domain git failures must not fail the live stream — they are an unavailable snapshot. */
export const recoverVcsStatusSnapshot = (
  cwd: string,
  status: Effect.Effect<VcsStatusResult, GitCommandError>,
): Effect.Effect<VcsStatusResult> =>
  status.pipe(
    Effect.catchTag("GitCommandError", (error) =>
      Effect.logWarning("VCS status snapshot failed").pipe(
        Effect.annotateLogs({
          operation: error.operation,
          cwdLength: cwd.length,
        }),
        Effect.as(unavailableVcsStatus(cwd)),
      ),
    ),
  )

export const DEFAULT_VCS_STATUS_REFRESH_INTERVAL = Duration.seconds(60)

interface VcsStatusChange {
  readonly cwd: string
  readonly event: VcsStatusStreamEvent
}

interface ActivePoller {
  readonly fiber: Fiber.Fiber<void>
  readonly subscriberCount: number
}

export class VcsStatusBroadcaster extends Context.Service<
  VcsStatusBroadcaster,
  {
    readonly streamStatus: (
      cwd: string,
      options?: { readonly interval?: Duration.Duration },
    ) => Stream.Stream<VcsStatusStreamEvent, GitCommandError>
    readonly refresh: (cwd: string) => Effect.Effect<VcsStatusResult, GitCommandError>
  }
>()("@noyau/server/git/VcsStatusBroadcaster") {}

const fingerprint = (status: VcsStatusResult): string => JSON.stringify(status)

export const make = Effect.gen(function* () {
  const git = yield* GitRuntime
  const changes = yield* Effect.acquireRelease(PubSub.unbounded<VcsStatusChange>(), (pubsub) =>
    PubSub.shutdown(pubsub),
  )
  const broadcasterScope = yield* Effect.acquireRelease(Scope.make(), (scope) =>
    Scope.close(scope, Exit.void),
  )
  const cacheRef = yield* Ref.make(new Map<string, VcsStatusResult>())
  const pollersRef = yield* SynchronizedRef.make(new Map<string, ActivePoller>())

  const remember = (cwd: string, status: VcsStatusResult) =>
    Ref.update(cacheRef, (cache) => {
      const next = new Map(cache)
      next.set(cwd, status)
      return next
    })

  const publishIfChanged = Effect.fn("VcsStatusBroadcaster.publishIfChanged")(function* (
    cwd: string,
    status: VcsStatusResult,
  ) {
    const changed = yield* Ref.modify(cacheRef, (cache) => {
      const previous = cache.get(cwd)
      if (previous !== undefined && fingerprint(previous) === fingerprint(status)) {
        return [false, cache]
      }
      const next = new Map(cache)
      next.set(cwd, status)
      return [true, next]
    })
    if (changed) {
      const event: VcsStatusStreamEvent = { _tag: "updated", status }
      yield* PubSub.publish(changes, { cwd, event })
    }
    return status
  })

  const refresh: VcsStatusBroadcaster["Service"]["refresh"] = Effect.fn(
    "VcsStatusBroadcaster.refresh",
  )(function* (cwd: string) {
    const status = yield* git.status(cwd, { includePr: true })
    return yield* publishIfChanged(cwd, status)
  })

  const pollOnce = Effect.fn("VcsStatusBroadcaster.pollOnce")(function* (
    cwd: string,
    includePr: boolean,
  ) {
    const status = yield* git.status(cwd, { includePr })
    return yield* publishIfChanged(cwd, status)
  })

  const retainPoller = Effect.fn("VcsStatusBroadcaster.retainPoller")(function* (
    cwd: string,
    interval: Duration.Duration,
  ) {
    yield* SynchronizedRef.modifyEffect(pollersRef, (active) => {
      const existing = active.get(cwd)
      if (existing !== undefined) {
        const next = new Map(active)
        next.set(cwd, { ...existing, subscriberCount: existing.subscriberCount + 1 })
        return Effect.succeed([undefined, next] as const)
      }
      const pollerState = { pollCount: 0 }
      const loop = Effect.gen(function* () {
        pollerState.pollCount += 1
        // PR metadata (gh) is expensive — only every 3rd tick; git status stays frequent enough.
        const includePr = pollerState.pollCount % 3 === 1
        yield* pollOnce(cwd, includePr).pipe(
          Effect.catchTag("GitCommandError", (error) =>
            Effect.logWarning("VCS status refresh failed").pipe(
              Effect.annotateLogs({
                operation: error.operation,
                cwdLength: cwd.length,
              }),
            ),
          ),
        )
        yield* Effect.sleep(interval)
      }).pipe(Effect.forever)
      return loop.pipe(
        Effect.forkIn(broadcasterScope),
        Effect.map((fiber) => {
          const next = new Map(active)
          next.set(cwd, { fiber, subscriberCount: 1 })
          return [undefined, next] as const
        }),
      )
    })
  })

  const releasePoller = Effect.fn("VcsStatusBroadcaster.releasePoller")(function* (cwd: string) {
    const fiber = yield* SynchronizedRef.modify(pollersRef, (active) => {
      const existing = active.get(cwd)
      if (existing === undefined) {
        return [null, active]
      }
      if (existing.subscriberCount > 1) {
        const next = new Map(active)
        next.set(cwd, { ...existing, subscriberCount: existing.subscriberCount - 1 })
        return [null, next]
      }
      const next = new Map(active)
      next.delete(cwd)
      return [existing.fiber, next]
    })
    if (fiber !== null) {
      yield* Fiber.interrupt(fiber).pipe(Effect.ignore)
    }
  })

  const streamStatus: VcsStatusBroadcaster["Service"]["streamStatus"] = (cwd, options) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const interval = options?.interval ?? DEFAULT_VCS_STATUS_REFRESH_INTERVAL
        const subscription = yield* PubSub.subscribe(changes)
        const cached = (yield* Ref.get(cacheRef)).get(cwd)
        const initial =
          cached ?? (yield* recoverVcsStatusSnapshot(cwd, git.status(cwd, { includePr: false })))
        if (cached === undefined) {
          yield* remember(cwd, initial)
        }
        yield* retainPoller(cwd, interval)
        return Stream.concat(
          Stream.make({ _tag: "snapshot" as const, status: initial }),
          Stream.fromSubscription(subscription).pipe(
            Stream.filter((change) => change.cwd === cwd),
            Stream.map((change) => change.event),
          ),
        ).pipe(Stream.ensuring(releasePoller(cwd).pipe(Effect.ignore, Effect.asVoid)))
      }),
    )

  return VcsStatusBroadcaster.of({ streamStatus, refresh })
})

export const vcsStatusBroadcasterLayer = Layer.effect(VcsStatusBroadcaster, make)
