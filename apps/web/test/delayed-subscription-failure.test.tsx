// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { useDelayedSubscriptionFailure } from "../src/hooks/use-delayed-subscription-failure"
import { invalidInputFailure, type AppFailure } from "../src/lib/app-failure"
import type { SubscriptionStatus } from "../src/lib/control-plane"

interface HookProps {
  readonly status: SubscriptionStatus
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("delayed subscription failure", () => {
  it("keeps a short reconnect silent and clears a visible failure after recovery", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        vi.useFakeTimers()
        const reconnecting: SubscriptionStatus = {
          _tag: "Reconnecting",
          attempt: 1,
          failure: invalidInputFailure("socket closed"),
        }
        const { result, rerender } = renderHook<AppFailure | undefined, HookProps>(
          ({ status }) => useDelayedSubscriptionFailure(status, 750),
          { initialProps: { status: reconnecting } },
        )

        yield* Effect.promise(() => act(() => vi.advanceTimersByTimeAsync(749)))
        expect(result.current).toBeUndefined()

        yield* Effect.promise(() => act(() => vi.advanceTimersByTimeAsync(1)))
        expect(result.current).toEqual(reconnecting.failure)

        rerender({ status: { _tag: "Connected" } })
        expect(result.current).toBeUndefined()
      }),
    ))

  it("surfaces a Failed subscription immediately", () => {
    const failed: SubscriptionStatus = {
      _tag: "Failed",
      failure: invalidInputFailure("forbidden"),
    }
    const { result } = renderHook<AppFailure | undefined, HookProps>(
      ({ status }) => useDelayedSubscriptionFailure(status, 750),
      { initialProps: { status: failed } },
    )
    expect(result.current).toEqual(failed.failure)
  })
})
