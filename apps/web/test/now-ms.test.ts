import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { subscribeNowMs } from "../src/lib/now-ms"

describe("now-ms ticker", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("notifies every subscriber on the same tick", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-23T12:00:00.400Z"))
    const first: number[] = []
    const second: number[] = []
    const stopFirst = subscribeNowMs((now) => {
      first.push(now)
    })
    const stopSecond = subscribeNowMs((now) => {
      second.push(now)
    })

    vi.advanceTimersByTime(600)

    expect(first).toEqual(second)
    expect(first).toHaveLength(1)

    stopFirst()
    stopSecond()
  })
})
