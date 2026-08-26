import { describe, expect, it } from "vite-plus/test"

import {
  describeKeybindingCondition,
  keybindingConditionSpecificity,
  keybindingConditionsOverlap,
  matchKeybindingCondition,
  resolveKeybindingSurface,
  type KeybindingConditionSnapshot,
} from "../src/lib/keybinding-when"

const snapshot = (
  extra: Partial<KeybindingConditionSnapshot> = {},
): KeybindingConditionSnapshot => ({
  surface: "thread",
  ticketSelected: false,
  columnSelected: false,
  dialogOpen: false,
  editableFocused: false,
  ...extra,
})

describe("resolveKeybindingSurface", () => {
  it("maps Tableau, Thread and Paramètres without treating settings as sticky", () => {
    expect(resolveKeybindingSurface("/projects/abc/board")).toBe("tableau")
    expect(resolveKeybindingSurface("/projects/abc/thread/new")).toBe("thread")
    expect(
      resolveKeybindingSurface("/projects/abc/thread/20000000-0000-4000-8000-000000000001"),
    ).toBe("thread")
    expect(resolveKeybindingSurface("/settings/keybindings")).toBe("settings")
    expect(resolveKeybindingSurface("/")).toBe("tableau")
    expect(resolveKeybindingSurface("/unknown")).toBeUndefined()
  })
})

describe("matchKeybindingCondition", () => {
  it("treats an empty Condition as always true", () => {
    expect(matchKeybindingCondition({}, snapshot({ surface: "settings", dialogOpen: true }))).toBe(
      true,
    )
  })

  it("requires every specified key to match", () => {
    const when = { surface: "thread" as const, dialogOpen: false }
    expect(matchKeybindingCondition(when, snapshot())).toBe(true)
    expect(matchKeybindingCondition(when, snapshot({ surface: "tableau" }))).toBe(false)
    expect(matchKeybindingCondition(when, snapshot({ dialogOpen: true }))).toBe(false)
  })
})

describe("keybindingConditionsOverlap", () => {
  it("overlaps when no key contradicts", () => {
    expect(keybindingConditionsOverlap({ surface: "thread" }, { dialogOpen: false })).toBe(true)
    expect(keybindingConditionsOverlap({}, { surface: "tableau" })).toBe(true)
  })

  it("does not overlap when surfaces or selections disagree", () => {
    expect(keybindingConditionsOverlap({ surface: "thread" }, { surface: "tableau" })).toBe(false)
    expect(keybindingConditionsOverlap({ ticketSelected: true }, { ticketSelected: false })).toBe(
      false,
    )
  })
})

describe("describeKeybindingCondition", () => {
  it("names the Surface and the sélection, ignores chrome keys", () => {
    expect(describeKeybindingCondition({ surface: "thread", dialogOpen: false })).toBe(
      "dans un Thread",
    )
    expect(
      describeKeybindingCondition({
        surface: "tableau",
        ticketSelected: true,
        editableFocused: false,
      }),
    ).toBe("sur le Tableau · ticket sélectionné")
    expect(
      describeKeybindingCondition({ dialogOpen: false, editableFocused: false }),
    ).toBeUndefined()
  })

  it("counts specified keys for specificity", () => {
    expect(keybindingConditionSpecificity({})).toBe(0)
    expect(keybindingConditionSpecificity({ surface: "thread", dialogOpen: false })).toBe(2)
  })
})
