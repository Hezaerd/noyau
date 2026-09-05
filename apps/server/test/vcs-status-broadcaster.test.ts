import { describe, expect, it } from "@effect/vitest"
import { GitCommandError } from "@noyau/contracts/git"
import { unavailableVcsStatus } from "@noyau/server/git/git-runtime"
import { GitRuntime } from "@noyau/server/git/git-runtime"
import {
  DEFAULT_VCS_STATUS_REFRESH_INTERVAL,
  VcsStatusBroadcaster,
  recoverVcsStatusSnapshot,
  vcsStatusBroadcasterLayer,
} from "@noyau/server/git/vcs-status-broadcaster"
import { Deferred, Duration, Effect, Exit, Fiber, Layer, Option, Ref, Scope, Stream } from "effect"

import { stubGitRuntimeLayer } from "./fixtures.ts"

const statusFor = (cwd: string) => ({ ...unavailableVcsStatus(cwd), isRepo: true })

const broadcasterLayer = (status: GitRuntime["Service"]["status"]) => {
  const gitLayer = Layer.effect(
    GitRuntime,
    Effect.map(GitRuntime, (git) => GitRuntime.of({ ...git, status })),
  ).pipe(Layer.provide(stubGitRuntimeLayer))
  return vcsStatusBroadcasterLayer.pipe(Layer.provide(gitLayer))
}

const snapshot = (cwd: string) =>
  Effect.flatMap(VcsStatusBroadcaster, (broadcaster) =>
    broadcaster.streamStatus(cwd).pipe(Stream.take(1), Stream.runHead),
  )

const runWith = <A, E>(
  effect: Effect.Effect<A, E, VcsStatusBroadcaster>,
  layer: Layer.Layer<VcsStatusBroadcaster>,
) =>
  Effect.gen(function* () {
    const services = yield* Layer.build(layer)
    return yield* effect.pipe(Effect.provide(services))
  }).pipe(Effect.scoped)

describe("VcsStatusBroadcaster snapshot recovery", () => {
  it("polls each active worktree every thirty seconds by default", () => {
    expect(Duration.toSeconds(DEFAULT_VCS_STATUS_REFRESH_INTERVAL)).toBe(30)
  })

  it("turns a missing-worktree git failure into an unavailable status", () =>
    Effect.runPromise(
      recoverVcsStatusSnapshot(
        "/missing/worktree",
        Effect.fail(
          new GitCommandError({
            operation: "git.rev-parse",
            detail: "ENOENT: no such file or directory",
          }),
        ),
      ).pipe(
        Effect.map((status) => {
          expect(status).toEqual(unavailableVcsStatus("/missing/worktree"))
        }),
      ),
    ))

  it("keeps a successful status", () => {
    const status = unavailableVcsStatus("/tmp/repo")
    return Effect.runPromise(
      recoverVcsStatusSnapshot("/tmp/repo", Effect.succeed(status)).pipe(
        Effect.map((recovered) => {
          expect(recovered).toBe(status)
        }),
      ),
    )
  })
})

describe("VcsStatusBroadcaster initial snapshots", () => {
  it.effect("shares one initial status read between simultaneous subscribers", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const calls = yield* Ref.make(0)
      const layer = broadcasterLayer((cwd, options) =>
        options?.includePr === false
          ? Ref.updateAndGet(calls, (count) => count + 1).pipe(
              Effect.tap(() => Deferred.succeed(started, undefined)),
              Effect.andThen(Deferred.await(release)),
              Effect.as(statusFor(cwd)),
            )
          : Effect.never,
      )
      const program = Effect.gen(function* () {
        const first = yield* snapshot("/repo").pipe(Effect.forkChild)
        yield* Deferred.await(started)
        const second = yield* snapshot("/repo").pipe(Effect.forkChild)
        yield* Effect.yieldNow
        expect(yield* Ref.get(calls)).toBe(1)
        yield* Deferred.succeed(release, undefined)
        expect(yield* Fiber.join(first)).toEqual(
          Option.some({ _tag: "snapshot", status: statusFor("/repo") }),
        )
        expect(yield* Fiber.join(second)).toEqual(
          Option.some({ _tag: "snapshot", status: statusFor("/repo") }),
        )
        expect(yield* Ref.get(calls)).toBe(1)
      })
      yield* runWith(program, layer)
    }),
  )

  it.effect("starts initial status reads for different worktrees independently", () =>
    Effect.gen(function* () {
      const startedA = yield* Deferred.make<void>()
      const startedB = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const layer = broadcasterLayer((cwd, options) =>
        options?.includePr === false
          ? Deferred.succeed(cwd === "/a" ? startedA : startedB, undefined).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.as(statusFor(cwd)),
            )
          : Effect.never,
      )
      const program = Effect.gen(function* () {
        const first = yield* snapshot("/a").pipe(Effect.forkChild)
        const second = yield* snapshot("/b").pipe(Effect.forkChild)
        yield* Deferred.await(startedA)
        yield* Deferred.await(startedB)
        yield* Deferred.succeed(release, undefined)
        yield* Fiber.join(first)
        yield* Fiber.join(second)
      })
      yield* runWith(program, layer)
    }),
  )

  it.effect("keeps a shared read alive when its first subscriber is canceled", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const calls = yield* Ref.make(0)
      const layer = broadcasterLayer((cwd, options) =>
        options?.includePr === false
          ? Ref.updateAndGet(calls, (count) => count + 1).pipe(
              Effect.tap(() => Deferred.succeed(started, undefined)),
              Effect.andThen(Deferred.await(release)),
              Effect.as(statusFor(cwd)),
            )
          : Effect.never,
      )
      const program = Effect.gen(function* () {
        const canceled = yield* snapshot("/repo").pipe(Effect.forkChild)
        yield* Deferred.await(started)
        yield* Fiber.interrupt(canceled)
        const retry = yield* snapshot("/repo").pipe(Effect.forkChild)
        yield* Effect.yieldNow
        expect(yield* Ref.get(calls)).toBe(1)
        yield* Deferred.succeed(release, undefined)
        expect(yield* Fiber.join(retry)).toEqual(
          Option.some({ _tag: "snapshot", status: statusFor("/repo") }),
        )
      })
      yield* runWith(program, layer)
    }),
  )

  it.effect("reuses a completed initial snapshot", () =>
    Effect.gen(function* () {
      const calls = yield* Ref.make(0)
      const layer = broadcasterLayer((cwd, options) =>
        options?.includePr === false
          ? Ref.update(calls, (count) => count + 1).pipe(Effect.as(statusFor(cwd)))
          : Effect.never,
      )
      const program = Effect.gen(function* () {
        expect(yield* snapshot("/repo")).toEqual(
          Option.some({ _tag: "snapshot", status: statusFor("/repo") }),
        )
        expect(yield* snapshot("/repo")).toEqual(
          Option.some({ _tag: "snapshot", status: statusFor("/repo") }),
        )
        expect(yield* Ref.get(calls)).toBe(1)
      })
      yield* runWith(program, layer)
    }),
  )

  it.effect("does not let a delayed initial snapshot overwrite a refresh", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const stale = { ...statusFor("/repo"), hasWorkingTreeChanges: false }
      const fresh = { ...statusFor("/repo"), hasWorkingTreeChanges: true }
      const layer = broadcasterLayer((_cwd, options) =>
        options?.includePr === false
          ? Deferred.succeed(started, undefined).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.as(stale),
            )
          : Effect.succeed(fresh),
      )
      const program = Effect.gen(function* () {
        const initial = yield* snapshot("/repo").pipe(Effect.forkChild)
        yield* Deferred.await(started)
        const broadcaster = yield* VcsStatusBroadcaster
        expect(yield* broadcaster.refresh("/repo")).toEqual(fresh)
        yield* Deferred.succeed(release, undefined)
        expect(yield* Fiber.join(initial)).toEqual(Option.some({ _tag: "snapshot", status: fresh }))
        expect(yield* snapshot("/repo")).toEqual(Option.some({ _tag: "snapshot", status: fresh }))
      })
      yield* runWith(program, layer)
    }),
  )

  it.effect("interrupts a shared initial read when the broadcaster is disposed", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const finalized = yield* Deferred.make<void>()
      const layer = broadcasterLayer((_cwd, options) =>
        options?.includePr === false
          ? Deferred.succeed(started, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.ensuring(Deferred.succeed(finalized, undefined)),
            )
          : Effect.never,
      )
      const serviceScope = yield* Scope.make()
      const services = yield* layer.pipe(Layer.buildWithScope(serviceScope))
      const waiter = yield* snapshot("/repo").pipe(Effect.provide(services), Effect.forkChild)
      yield* Deferred.await(started)
      yield* Fiber.interrupt(waiter)
      yield* Scope.close(serviceScope, Exit.void)
      yield* Deferred.await(finalized)
    }),
  )
})
