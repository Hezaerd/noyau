import { describe, expect, it } from "vite-plus/test"

import {
  applicableRecentActionIds,
  buildPaletteGroups,
  parseRecentActionIds,
  serializeRecentActionIds,
  updateRecentActionIds,
} from "../src/lib/app-palette"

const item = (id: string) => ({ id })

describe("app Palette", () => {
  it("stores a bounded unique MRU list", () => {
    expect(updateRecentActionIds(["b", "a", "c"], "a", 3)).toEqual(["a", "b", "c"])
    expect(updateRecentActionIds(["b", "c", "d"], "a", 3)).toEqual(["a", "b", "c"])
  })

  it("round-trips local recent preferences and rejects invalid data", () => {
    expect(
      parseRecentActionIds(serializeRecentActionIds(["board.search", "navigate.inbox"])),
    ).toEqual(["board.search", "navigate.inbox"])
    expect(parseRecentActionIds('{"not":"an array"}')).toEqual([])
  })

  it("keeps only recents that remain in the current Catalogue", () => {
    expect(
      applicableRecentActionIds(["ticket.create", "navigate.channel"], [item("navigate.channel")]),
    ).toEqual(["navigate.channel"])
  })

  it("orders groups and removes recent duplicates", () => {
    const groups = buildPaletteGroups(
      [item("ticket.create"), item("board.search")],
      [item("navigate.inbox")],
      ["board.search"],
    )

    expect(groups.map((group) => group.id)).toEqual(["recents", "actions", "navigation"])
    expect(groups[0]?.items.map(({ id }) => id)).toEqual(["board.search"])
    expect(groups[1]?.items.map(({ id }) => id)).toEqual(["ticket.create"])
    expect(groups[2]?.items.map(({ id }) => id)).toEqual(["navigate.inbox"])
  })

  it("omits empty groups", () => {
    expect(buildPaletteGroups([], [item("navigate.board")], [])).toEqual([
      {
        id: "navigation",
        label: "Navigation",
        items: [item("navigate.board")],
      },
    ])
  })
})
