// @vitest-environment happy-dom

import { describe, expect, it } from "vite-plus/test"

import { composerPathListCanScrollDown } from "../src/lib/composer-path-menu"

const listWithScroll = (metrics: {
  readonly scrollHeight: number
  readonly clientHeight: number
  readonly scrollTop: number
}): HTMLElement => {
  const list = document.createElement("ul")
  Object.defineProperty(list, "scrollHeight", { value: metrics.scrollHeight })
  Object.defineProperty(list, "clientHeight", { value: metrics.clientHeight })
  Object.defineProperty(list, "scrollTop", { value: metrics.scrollTop })
  return list
}

describe("composerPathListCanScrollDown", () => {
  it("is false when the list fits", () => {
    expect(
      composerPathListCanScrollDown(
        listWithScroll({ scrollHeight: 40, clientHeight: 40, scrollTop: 0 }),
      ),
    ).toBe(false)
  })

  it("is true when content remains below the fold", () => {
    expect(
      composerPathListCanScrollDown(
        listWithScroll({ scrollHeight: 200, clientHeight: 80, scrollTop: 0 }),
      ),
    ).toBe(true)
  })

  it("is false when scrolled to the end", () => {
    expect(
      composerPathListCanScrollDown(
        listWithScroll({ scrollHeight: 200, clientHeight: 80, scrollTop: 120 }),
      ),
    ).toBe(false)
  })
})
