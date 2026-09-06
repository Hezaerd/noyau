// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useMediaQuery } from "../src/hooks/use-media-query"

type FakeMediaQueryList = MediaQueryList & {
  setMatches: (matches: boolean) => void
  listenerCount: () => number
}

const mediaQueryLists = new Map<string, FakeMediaQueryList>()
const initialMatches = new Map<string, boolean>()
const matchMedia = vi.fn<(query: string) => MediaQueryList>()

function makeMediaQueryList(query: string, initialValue: boolean): FakeMediaQueryList {
  let matches = initialValue
  const listeners = new Set<EventListener>()

  const mediaQueryList: FakeMediaQueryList = {
    media: query,
    get matches() {
      return matches
    },
    onchange: null,
    addEventListener(_type: string, listener: EventListener) {
      listeners.add(listener)
    },
    removeEventListener(_type: string, listener: EventListener) {
      listeners.delete(listener)
    },
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return true
    },
    setMatches(nextMatches: boolean) {
      matches = nextMatches
      for (const listener of listeners) listener(new Event("change"))
    },
    listenerCount: () => listeners.size,
  }
  mediaQueryLists.set(query, mediaQueryList)
  return mediaQueryList
}

beforeEach(() => {
  mediaQueryLists.clear()
  initialMatches.clear()
  matchMedia.mockImplementation((query) =>
    makeMediaQueryList(query, initialMatches.get(query) ?? false),
  )
  vi.spyOn(window, "matchMedia").mockImplementation(matchMedia)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("useMediaQuery", () => {
  it("reuses one MediaQueryList for snapshots and unchanged rerenders", () => {
    const { result, rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: { min: "md" as const } },
    })

    expect(result.current).toBe(false)
    expect(matchMedia).toHaveBeenCalledTimes(1)

    rerender({ query: { min: "md" as const } })
    rerender({ query: { min: "md" as const } })

    expect(result.current).toBe(false)
    expect(matchMedia).toHaveBeenCalledTimes(1)
  })

  it("updates on changes and removes the listener on unmount", () => {
    const { result, unmount } = renderHook(() => useMediaQuery("(min-width: 800px)"))
    const mediaQueryList = mediaQueryLists.get("(min-width: 800px)")

    expect(mediaQueryList?.listenerCount()).toBe(1)

    act(() => mediaQueryList?.setMatches(true))
    expect(result.current).toBe(true)
    expect(matchMedia).toHaveBeenCalledTimes(1)

    unmount()
    expect(mediaQueryList?.listenerCount()).toBe(0)
  })

  it.each([false, true])(
    "cleans up the old query when switching to an initially %s query",
    (nextInitialMatches) => {
      const { result, rerender } = renderHook(({ query }) => useMediaQuery(query), {
        initialProps: { query: "(min-width: 800px)" },
      })
      const oldMediaQueryList = mediaQueryLists.get("(min-width: 800px)")
      initialMatches.set("(max-width: 799px)", nextInitialMatches)

      rerender({ query: "(max-width: 799px)" })
      const nextMediaQueryList = mediaQueryLists.get("(max-width: 799px)")

      expect(result.current).toBe(nextInitialMatches)
      expect(oldMediaQueryList?.listenerCount()).toBe(0)
      expect(nextMediaQueryList?.listenerCount()).toBe(1)
      expect(matchMedia).toHaveBeenCalledTimes(2)

      act(() => oldMediaQueryList?.setMatches(!nextInitialMatches))
      expect(result.current).toBe(nextInitialMatches)

      act(() => nextMediaQueryList?.setMatches(!nextInitialMatches))
      expect(result.current).toBe(!nextInitialMatches)
      expect(matchMedia).toHaveBeenCalledTimes(2)
    },
  )

  it("keeps separate lists for separate hook instances", () => {
    const first = renderHook(() => useMediaQuery("(min-width: 800px)"))
    const firstMediaQueryList = mediaQueryLists.get("(min-width: 800px)")
    const second = renderHook(() => useMediaQuery("(min-width: 800px)"))
    const secondMediaQueryList = mediaQueryLists.get("(min-width: 800px)")

    expect(firstMediaQueryList).not.toBe(secondMediaQueryList)
    expect(firstMediaQueryList?.listenerCount()).toBe(1)
    expect(secondMediaQueryList?.listenerCount()).toBe(1)
    expect(matchMedia).toHaveBeenCalledTimes(2)

    first.unmount()
    expect(secondMediaQueryList?.listenerCount()).toBe(1)
    second.unmount()
    expect(secondMediaQueryList?.listenerCount()).toBe(0)
  })
})
