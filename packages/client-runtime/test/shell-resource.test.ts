import { describe, expect, it } from "@effect/vitest"
import {
  ConnectionSupervisor,
  connectionState,
  TransportRupture,
  type ConnectionState,
} from "@noyau/client-runtime/connection"
import type { ControlPlaneRpcClient, RpcSession } from "@noyau/client-runtime/rpc"
import { createShellResourceAtom, type ShellResourceState } from "@noyau/client-runtime/state/shell"
import { makeTestRegistry } from "@noyau/client-runtime/testing"
import { Sequence } from "@noyau/protocol/ids"
import { RPC_METHODS, type SubscribeShellInput, type ShellStreamItem } from "@noyau/protocol/rpc"
import { Effect, Latch, Layer, Stream, SubscriptionRef } from "effect"
import type { AtomRegistry } from "effect/unstable/reactivity"
import { AsyncResult, Atom } from "effect/unstable/reactivity"

import { snapshotFrame, synchronizedFrame } from "./shell-fixtures.ts"

const successValue = <A, E>(result: AsyncResult.AsyncResult<A, E>): A | undefined =>
  AsyncResult.isSuccess(result) ? result.value : undefined

const awaitResource = (
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Atom<AsyncResult.AsyncResult<ShellResourceState, unknown>>,
  match: (state: ShellResourceState) => boolean,
): Effect.Effect<ShellResourceState> =>
  Effect.callback<ShellResourceState>((resume) => {
    let settled = false
    const done = (value: ShellResourceState, cancel: () => void) => {
      if (settled) {
        return
      }
      settled = true
      cancel()
      resume(Effect.succeed(value))
    }
    const cancel = registry.subscribe(atom, (result) => {
      const value = successValue(result)
      if (value !== undefined && match(value)) {
        done(value, cancel)
      }
    })
    const current = successValue(registry.get(atom))
    if (current !== undefined && match(current)) {
      done(current, cancel)
    }
  })

const makeSession = (generation: number, client: ControlPlaneRpcClient): RpcSession => ({
  generation,
  client,
  ready: Effect.void,
  closed: Effect.never,
  dispose: Effect.void,
})

const shellSubscribeClient = (methods: {
  readonly [RPC_METHODS.subscribeShell]: (
    input: SubscribeShellInput,
  ) => Stream.Stream<ShellStreamItem>
}): ControlPlaneRpcClient => {
  // SAFETY: tests only invoke subscribeShell; other RPC methods throw.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const target = Object.create(null) as ControlPlaneRpcClient
  return new Proxy(target, {
    get: (_value, prop) => {
      if (prop === RPC_METHODS.subscribeShell) {
        return methods[RPC_METHODS.subscribeShell]
      }
      throw new Error(`fake RpcSession does not implement ${String(prop)}`)
    },
  })
}

const makeShellSupervisor = (
  subscribe: (input: SubscribeShellInput, generation: number) => Stream.Stream<ShellStreamItem>,
  initial: ConnectionState = connectionState("connected", 1, 0),
): Effect.Effect<{
  readonly layer: Layer.Layer<ConnectionSupervisor>
  readonly setState: (next: ConnectionState) => Effect.Effect<void>
  readonly subscribeInputs: Array<SubscribeShellInput>
}> =>
  Effect.gen(function* () {
    const state = yield* SubscriptionRef.make(initial)
    const subscribeInputs: Array<SubscribeShellInput> = []
    const client = {
      [RPC_METHODS.subscribeShell]: (input: SubscribeShellInput) => {
        subscribeInputs.push(input)
        return subscribe(input, subscribeInputs.length)
      },
    }
    const supervisor = ConnectionSupervisor.of({
      state,
      currentSession: Effect.gen(function* () {
        const snapshot = yield* SubscriptionRef.get(state)
        if (snapshot.phase !== "connected") {
          return yield* new TransportRupture({ reason: "failed" })
        }
        return makeSession(snapshot.generation, shellSubscribeClient(client))
      }),
      notifyTransportRupture: () => Effect.void,
      notifyFailure: () => Effect.void,
      start: Effect.void,
      stop: Effect.void,
    })
    return {
      layer: Layer.succeed(ConnectionSupervisor)(supervisor),
      setState: (next) => SubscriptionRef.set(state, next),
      subscribeInputs,
    }
  })

describe("createShellResourceAtom", () => {
  it.effect("passe empty → synchronizing → live ; synchronized n'est pas Connected", () =>
    Effect.gen(function* () {
      const snapshotLatch = Latch.makeUnsafe()
      const syncLatch = Latch.makeUnsafe()
      const supervisor = yield* makeShellSupervisor(() =>
        Stream.fromEffect(snapshotLatch.await).pipe(
          Stream.flatMap(() => Stream.make(snapshotFrame(4))),
          Stream.concat(
            Stream.fromEffect(syncLatch.await).pipe(
              Stream.flatMap(() => Stream.make(synchronizedFrame)),
            ),
          ),
        ),
      )
      const runtime = Atom.runtime(supervisor.layer)
      const atom = createShellResourceAtom(runtime)
      const registry = makeTestRegistry()
      const unmount = registry.mount(atom)

      const empty = yield* awaitResource(registry, atom, (state) => state.phase === "empty")
      expect(empty.value).toBeUndefined()
      expect(empty).not.toHaveProperty("_tag")

      snapshotLatch.openUnsafe()
      const synchronizing = yield* awaitResource(
        registry,
        atom,
        (state) => state.phase === "synchronizing" && state.value !== undefined,
      )
      expect(synchronizing.value?.snapshotSequence).toBe(4)
      expect(synchronizing.phase).not.toBe("live")

      syncLatch.openUnsafe()
      const live = yield* awaitResource(registry, atom, (state) => state.phase === "live")
      expect(live.value).toBe(synchronizing.value)
      expect(live.phase).toBe("live")
      expect(live).not.toEqual(expect.objectContaining({ _tag: "Connected" }))

      unmount()
      registry.dispose()
    }),
  )

  it.effect("conserve value à la reconnexion et resouscrit avec afterSequence", () =>
    Effect.gen(function* () {
      let calls = 0
      const secondLatch = Latch.makeUnsafe()
      const supervisor = yield* makeShellSupervisor(() => {
        calls += 1
        if (calls === 1) {
          return Stream.make(snapshotFrame(7), synchronizedFrame)
        }
        return Stream.fromEffect(secondLatch.await).pipe(
          Stream.flatMap(() => Stream.make(synchronizedFrame)),
        )
      })
      const runtime = Atom.runtime(supervisor.layer)
      const atom = createShellResourceAtom(runtime)
      const registry = makeTestRegistry()
      const unmount = registry.mount(atom)

      const live = yield* awaitResource(registry, atom, (state) => state.phase === "live")
      expect(live.value?.snapshotSequence).toBe(7)
      expect(supervisor.subscribeInputs).toEqual([{}])

      yield* supervisor.setState(connectionState("connected", 2, 0))
      const synchronizing = yield* awaitResource(
        registry,
        atom,
        (state) => state.phase === "synchronizing" && state.value !== undefined,
      )
      expect(synchronizing.value).toBe(live.value)
      expect(supervisor.subscribeInputs).toEqual([{}, { afterSequence: Sequence.make(7) }])

      secondLatch.openUnsafe()
      const relive = yield* awaitResource(registry, atom, (state) => state.phase === "live")
      expect(relive.value).toBe(live.value)

      unmount()
      registry.dispose()
    }),
  )

  it.effect("ignore une génération plus ancienne", () =>
    Effect.gen(function* () {
      const staleLatch = Latch.makeUnsafe()
      let calls = 0
      const supervisor = yield* makeShellSupervisor(() => {
        calls += 1
        if (calls === 1) {
          return Stream.fromEffect(staleLatch.await).pipe(
            Stream.flatMap(() => Stream.make(snapshotFrame(1), synchronizedFrame)),
          )
        }
        return Stream.make(snapshotFrame(20), synchronizedFrame)
      })
      const runtime = Atom.runtime(supervisor.layer)
      const atom = createShellResourceAtom(runtime)
      const registry = makeTestRegistry()
      const unmount = registry.mount(atom)

      yield* awaitResource(registry, atom, (state) => state.phase === "empty")
      yield* supervisor.setState(connectionState("connected", 2, 0))
      const live = yield* awaitResource(
        registry,
        atom,
        (state) => state.phase === "live" && state.value?.snapshotSequence === 20,
      )
      expect(live.value?.snapshotSequence).toBe(20)

      staleLatch.openUnsafe()
      yield* Effect.yieldNow
      const afterStale = successValue(registry.get(atom))
      expect(afterStale?.value?.snapshotSequence).toBe(20)
      expect(afterStale?.phase).toBe("live")

      unmount()
      registry.dispose()
    }),
  )

  it.effect("partage une seule subscription entre deux mounts", () =>
    Effect.gen(function* () {
      let calls = 0
      const supervisor = yield* makeShellSupervisor(() => {
        calls += 1
        return Stream.make(snapshotFrame(3), synchronizedFrame)
      })
      const runtime = Atom.runtime(supervisor.layer)
      const atom = createShellResourceAtom(runtime)
      const registry = makeTestRegistry()
      const first = registry.mount(atom)
      const second = registry.mount(atom)

      yield* awaitResource(registry, atom, (state) => state.phase === "live")
      expect(calls).toBe(1)
      expect(supervisor.subscribeInputs).toHaveLength(1)

      first()
      yield* Effect.yieldNow
      expect(calls).toBe(1)
      expect(successValue(registry.get(atom))?.phase).toBe("live")

      second()
      registry.dispose()
    }),
  )
})
