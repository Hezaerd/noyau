import { describe, expect, it } from "vite-plus/test"

import {
  applicableRecentActionIds,
  buildPaletteGroups,
  filterPaletteGroups,
  paletteShortcutIndex,
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
      parseRecentActionIds(serializeRecentActionIds(["board.search", "navigate.board"])),
    ).toEqual(["board.search", "navigate.board"])
    expect(parseRecentActionIds('{"not":"an array"}')).toEqual([])
  })

  it("maps physical number keys independently from the keyboard layout", () => {
    expect(paletteShortcutIndex("Digit1")).toBe(0)
    expect(paletteShortcutIndex("Digit9")).toBe(8)
    expect(paletteShortcutIndex("KeyA")).toBeUndefined()
    expect(paletteShortcutIndex("Numpad1")).toBeUndefined()
  })

  it("keeps only recents that remain in the current Catalogue", () => {
    expect(
      applicableRecentActionIds(["ticket.create", "navigate.thread"], [item("navigate.thread")]),
    ).toEqual(["navigate.thread"])
  })

  it("orders groups and removes recent duplicates", () => {
    const groups = buildPaletteGroups(
      [item("ticket.create"), item("board.search")],
      [item("navigate.board")],
      ["board.search"],
    )

    expect(groups.map((group) => group.id)).toEqual(["recents", "actions", "navigation"])
    expect(groups[0]?.items.map(({ id }) => id)).toEqual(["board.search"])
    expect(groups[1]?.items.map(({ id }) => id)).toEqual(["ticket.create"])
    expect(groups[2]?.items.map(({ id }) => id)).toEqual(["navigate.board"])
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

  it("filters Ticket results by title or label without accents", () => {
    const groups = filterPaletteGroups(
      [
        {
          id: "tickets",
          label: "Tickets",
          items: [
            {
              id: "ticket-http",
              searchValue: "Corriger la requête HTTP backend urgent",
            },
            {
              id: "ticket-ui",
              searchValue: "Polir le Tableau frontend",
            },
          ],
        },
      ],
      "requete",
    )

    expect(groups[0]?.items.map(({ id }) => id)).toEqual(["ticket-http"])
    expect(filterPaletteGroups(groups, "urgent")[0]?.items).toHaveLength(1)
    expect(filterPaletteGroups(groups, "mobile")).toEqual([])
  })
})
