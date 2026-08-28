import { describe, expect, it } from "vite-plus/test"

import {
  parseSettledShelfExpanded,
  settledShelfLabel,
  settledThreadsVisibleInShelf,
} from "../src/lib/thread-sidebar-shelf"

describe("parseSettledShelfExpanded", () => {
  it.each([
    [null, false],
    ["on", true],
    ["off", false],
    ["yes", false],
  ] as const)("%s → %s", (value, expected) => {
    expect(parseSettledShelfExpanded(value)).toBe(expected)
  })
})

describe("settledShelfLabel", () => {
  it("keeps the count in both shelf states", () => {
    expect(settledShelfLabel(182)).toBe("Classés (182)")
  })
})

describe("settledThreadsVisibleInShelf", () => {
  const settled = [{ id: "a" }, { id: "b" }, { id: "c" }]

  it("returns every row when expanded", () => {
    expect(settledThreadsVisibleInShelf(settled, true)).toEqual(settled)
  })

  it("hides every row when collapsed", () => {
    expect(settledThreadsVisibleInShelf(settled, false)).toEqual([])
  })
})
