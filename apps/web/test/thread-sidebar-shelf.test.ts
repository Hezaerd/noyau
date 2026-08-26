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
    expect(settledThreadsVisibleInShelf(settled, { expanded: true, openThreadId: null })).toEqual(
      settled,
    )
  })

  it("hides every row when collapsed without an open Thread", () => {
    expect(settledThreadsVisibleInShelf(settled, { expanded: false, openThreadId: null })).toEqual(
      [],
    )
  })

  it("keeps the open Thread visible while collapsed", () => {
    expect(settledThreadsVisibleInShelf(settled, { expanded: false, openThreadId: "b" })).toEqual([
      { id: "b" },
    ])
  })

  it("hides every row when the open Thread is not settled", () => {
    expect(
      settledThreadsVisibleInShelf(settled, { expanded: false, openThreadId: "active" }),
    ).toEqual([])
  })
})
