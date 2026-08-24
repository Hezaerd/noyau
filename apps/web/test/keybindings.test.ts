import { describe, expect, it } from "vite-plus/test"

import {
  canonicalizeHotkey,
  hasCustomKeybindings,
  keybindingConflicts,
  parseKeybindingOverrides,
  resolveKeybinding,
  resolveKeybindings,
  serializeKeybindingOverrides,
} from "../src/lib/keybindings"
import {
  KEYBINDING_IDS,
  KEYBINDINGS,
  defaultKeybinding,
  isKeybindingId,
} from "../src/lib/keybindings-catalog"

const entriesOf = (overrides: ReturnType<typeof parseKeybindingOverrides>) =>
  Object.fromEntries(overrides)

describe("keybindings catalog", () => {
  it("declares a unique id for every Keybinding", () => {
    expect(KEYBINDINGS.map((keybinding) => keybinding.id)).toEqual([...KEYBINDING_IDS])
  })

  it("keeps every default Raccourci canonical", () => {
    for (const keybinding of KEYBINDINGS) {
      expect(canonicalizeHotkey(keybinding.defaultHotkey, "mac")).toBe(keybinding.defaultHotkey)
    }
  })
})

describe("keybinding overrides", () => {
  it("ignores unknown ids, invalid chords, and default values", () => {
    expect(
      entriesOf(
        parseKeybindingOverrides(
          serializeKeybindingOverrides(new Map([["palette.open", "Mod+P"]])),
          "mac",
        ),
      ),
    ).toEqual({ "palette.open": "Mod+P" })
    expect(entriesOf(parseKeybindingOverrides('{"palette.open":"Mod+K"}', "mac"))).toEqual({})
    expect(canonicalizeHotkey("NotAKey", "mac")).toBeUndefined()
    expect(entriesOf(parseKeybindingOverrides('{"palette.open":"NotAKey"}', "mac"))).toEqual({})
    expect(entriesOf(parseKeybindingOverrides('{"unknown.action":"Mod+P"}', "mac"))).toEqual({})
    expect(entriesOf(parseKeybindingOverrides("{", "mac"))).toEqual({})
  })

  it("resolves a custom Raccourci over the catalog default", () => {
    const overrides = new Map([["palette.open" as const, canonicalizeHotkey("Mod+P", "mac")!]])
    expect(resolveKeybinding("palette.open")).toBe(defaultKeybinding("palette.open"))
    expect(resolveKeybinding("palette.open", overrides)).toBe("Mod+P")
    expect(
      resolveKeybindings(new Map([["board.search", canonicalizeHotkey("Mod+F", "mac")!]]))[
        "board.search"
      ],
    ).toBe("Mod+F")
    expect(hasCustomKeybindings(overrides)).toBe(true)
    expect(hasCustomKeybindings(new Map())).toBe(false)
  })

  it("reports conflicts on the same resolved Raccourci", () => {
    const resolved = resolveKeybindings(
      new Map([["board.search", canonicalizeHotkey("C", "mac")!]]),
    )

    expect(keybindingConflicts("board.ticket.create", "C", resolved, "mac")).toEqual([
      "board.search",
    ])
    expect(keybindingConflicts("board.search", "/", resolveKeybindings(new Map()), "mac")).toEqual(
      [],
    )
    expect(
      keybindingConflicts("board.ticket.rename", "F2", resolveKeybindings(new Map()), "mac"),
    ).toEqual(["board.column.rename"])
    expect(
      keybindingConflicts("thread.rename", "F2", resolveKeybindings(new Map()), "mac"),
    ).toEqual([])
    expect(keybindingConflicts("palette.open", "Mod+K", resolved, "mac")).toEqual([])
    expect(isKeybindingId("palette.open")).toBe(true)
    expect(isKeybindingId("settings.open")).toBe(true)
    expect(isKeybindingId("thread.create")).toBe(true)
    expect(isKeybindingId("thread.rename")).toBe(true)
    expect(isKeybindingId("thread.pin")).toBe(true)
    expect(defaultKeybinding("settings.open")).toBe("Mod+,")
    expect(defaultKeybinding("thread.create")).toBe("Mod+N")
    expect(defaultKeybinding("thread.rename")).toBe("F2")
    expect(defaultKeybinding("thread.pin")).toBe("Mod+P")
    expect(isKeybindingId("unknown")).toBe(false)
  })
})
