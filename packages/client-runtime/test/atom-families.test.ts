import { afterEach, beforeEach, describe, expect, it, vitest } from "@effect/vitest"
import { connectionState } from "@noyau/client-runtime/connection"
import {
  createQueryAtomFamily,
  createSubscriptionAtomFamily,
} from "@noyau/client-runtime/state/runtime"
import { makeTestRegistry } from "@noyau/client-runtime/testing"
import { Effect, Latch, Stream } from "effect"
import { AsyncResult, Atom, AtomRegistry } from "effect/unstable/reactivity"

import { makeControllableSupervisor } from "./fake-supervisor.ts"

const successValue = <A, E>(result: AsyncResult.AsyncResult<A, E>): A | undefined =>
  AsyncResult.isSuccess(result) ? result.value : undefined

describe("createQueryAtomFamily", () => {
  it.effect("partage une exécution entre deux mounts du même input", () =>
    Effect.gen(function* () {
      const supervisor = yield* makeControllableSupervisor()
      const runtime = Atom.runtime(supervisor.layer)
      let executions = 0
      const family = createQueryAtomFamily(runtime, {
        label: "test.query.share",
        execute: (input: { readonly id: string }) =>
          Effect.sync(() => {
            executions += 1
            return input.id
          }),
      })
      const registry = makeTestRegistry()
      const atom = family({ id: "a" })
      const first = registry.mount(atom)
      const second = registry.mount(atom)
      expect(yield* AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true })).toBe("a")
      expect(executions).toBe(1)
      first()
      yield* Effect.yieldNow
      expect(successValue(registry.get(atom))).toBe("a")
      expect(executions).toBe(1)
      second()
      registry.dispose()
    }),
  )

  it.effect("nettoie après le dernier unmount quand idleTTL vaut 0", () =>
    Effect.gen(function* () {
      const supervisor = yield* makeControllableSupervisor()
      const runtime = Atom.runtime(supervisor.layer)
      let executions = 0
      const family = createQueryAtomFamily(runtime, {
        label: "test.query.release",
        idleTtlMs: 0,
        execute: () =>
          Effect.sync(() => {
            executions += 1
            return "once"
          }),
      })
      const registry = makeTestRegistry()
      const atom = family({ id: "release" })
      const unmount = registry.mount(atom)
      expect(yield* AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true })).toBe("once")
      expect(executions).toBe(1)
      unmount()
      yield* Effect.yieldNow
      expect(successValue(registry.get(atom))).toBe("once")
      expect(executions).toBe(2)
      registry.dispose()
    }),
  )

  it.effect("ignore le résultat d'une génération plus ancienne", () =>
    Effect.gen(function* () {
      const supervisor = yield* makeControllableSupervisor(connectionState("connected", 1, 0))
      const runtime = Atom.runtime(supervisor.layer)
      const firstLatch = Latch.makeUnsafe()
      const secondLatch = Latch.makeUnsafe()
      let calls = 0
      const family = createQueryAtomFamily(runtime, {
        label: "test.query.generation",
        execute: () => {
          const index = calls
          calls += 1
          return (index === 0 ? firstLatch : secondLatch).await.pipe(
            Effect.as(index === 0 ? "generation-1" : "generation-2"),
          )
        },
      })
      const registry = makeTestRegistry()
      const atom = family({ id: "stale" })
      const unmount = registry.mount(atom)
      yield* Effect.yieldNow
      expect(calls).toBe(1)

      yield* supervisor.setState(connectionState("connected", 2, 0))
      yield* Effect.yieldNow
      secondLatch.openUnsafe()
      expect(yield* AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true })).toBe(
        "generation-2",
      )

      firstLatch.openUnsafe()
      yield* Effect.yieldNow
      expect(successValue(registry.get(atom))).toBe("generation-2")
      expect(calls).toBe(2)
      unmount()
      registry.dispose()
    }),
  )

  it.effect("attend une génération connected avant d'exécuter", () =>
    Effect.gen(function* () {
      const supervisor = yield* makeControllableSupervisor(connectionState("connecting", 0, 0))
      const runtime = Atom.runtime(supervisor.layer)
      let executions = 0
      const family = createQueryAtomFamily(runtime, {
        label: "test.query.wait",
        execute: () =>
          Effect.sync(() => {
            executions += 1
            return "ready"
          }),
      })
      const registry = makeTestRegistry()
      const atom = family({ id: "wait" })
      const unmount = registry.mount(atom)
      yield* Effect.yieldNow
      expect(executions).toBe(0)
      expect(AsyncResult.isSuccess(registry.get(atom))).toBe(false)

      yield* supervisor.setState(connectionState("connected", 1, 0))
      expect(yield* AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true })).toBe(
        "ready",
      )
      expect(executions).toBe(1)
      unmount()
      registry.dispose()
    }),
  )
})

describe("createQueryAtomFamily idleTTL", () => {
  beforeEach(async () => {
    vitest.useFakeTimers({
      toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"],
    })
    await Effect.runPromise(Effect.yieldNow)
  })

  afterEach(() => {
    vitest.useRealTimers()
  })

  it("réacquiert la valeur précédente avant l'expiration de idleTTL", async () => {
    const supervisor = await Effect.runPromise(
      makeControllableSupervisor(connectionState("connected", 1, 0)),
    )
    const runtime = Atom.runtime(supervisor.layer)
    let executions = 0
    const family = createQueryAtomFamily(runtime, {
      label: "test.query.idle",
      idleTtlMs: 10_000,
      execute: () =>
        Effect.sync(() => {
          executions += 1
          return "cached"
        }),
    })
    const registry = makeTestRegistry()
    const atom = family({ id: "idle" })
    const unmount = registry.mount(atom)
    const first = await executeMounted(registry, atom)
    expect(first).toBe("cached")
    expect(executions).toBe(1)
    unmount()

    await vitest.advanceTimersByTimeAsync(100)
    const remount = registry.mount(atom)
    expect(successValue(registry.get(atom))).toBe("cached")
    expect(executions).toBe(1)
    remount()
    registry.dispose()
  })
})

describe("createSubscriptionAtomFamily", () => {
  it.effect("partage une subscription et suit une nouvelle génération", () =>
    Effect.gen(function* () {
      const supervisor = yield* makeControllableSupervisor(connectionState("connected", 1, 0))
      const runtime = Atom.runtime(supervisor.layer)
      const subscribed: Array<number> = []
      const family = createSubscriptionAtomFamily(runtime, {
        label: "test.sub.share",
        subscribe: (_input: { readonly id: string }, generation) => {
          subscribed.push(generation)
          return Stream.make(`g${generation}`)
        },
      })
      const registry = makeTestRegistry()
      const atom = family({ id: "shared" })
      const first = registry.mount(atom)
      const second = registry.mount(atom)
      yield* awaitSuccess(registry, atom, "g1")
      expect(subscribed).toEqual([1])

      first()
      yield* Effect.yieldNow
      expect(successValue(registry.get(atom))).toBe("g1")

      yield* supervisor.setState(connectionState("connected", 2, 0))
      yield* awaitSuccess(registry, atom, "g2")
      expect(subscribed).toEqual([1, 2])

      second()
      registry.dispose()
    }),
  )

  it.effect("nettoie après le dernier unmount quand idleTTL vaut 0", () =>
    Effect.gen(function* () {
      const supervisor = yield* makeControllableSupervisor()
      const runtime = Atom.runtime(supervisor.layer)
      const subscribed: Array<number> = []
      const family = createSubscriptionAtomFamily(runtime, {
        label: "test.sub.release",
        idleTtlMs: 0,
        subscribe: (_input: { readonly id: string }, generation) => {
          subscribed.push(generation)
          return Stream.make(`g${generation}`)
        },
      })
      const registry = makeTestRegistry()
      const atom = family({ id: "release" })
      const unmount = registry.mount(atom)
      yield* awaitSuccess(registry, atom, "g1")
      expect(subscribed).toEqual([1])
      unmount()
      yield* Effect.yieldNow
      expect(subscribed).toEqual([1])
      const remount = registry.mount(atom)
      yield* awaitSuccess(registry, atom, "g1")
      expect(subscribed).toEqual([1, 1])
      remount()
      registry.dispose()
    }),
  )
})

const executeMounted = async <A, E>(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>,
): Promise<A> =>
  Effect.runPromise(AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true }))

const awaitSuccess = <A, E>(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>,
  expected: A,
): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    let settled = false
    const done = (cancel: () => void) => {
      if (settled) {
        return
      }
      settled = true
      cancel()
      resume(Effect.void)
    }
    const cancel = registry.subscribe(atom, (result) => {
      if (successValue(result) === expected) {
        done(cancel)
      }
    })
    if (successValue(registry.get(atom)) === expected) {
      done(cancel)
    }
  })
