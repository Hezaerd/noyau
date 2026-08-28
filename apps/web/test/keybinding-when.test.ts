import { describe, expect, it } from "vite-plus/test"

import {
  evaluateWhenNode,
  keybindingContextFromSurface,
  matchesWhenClause,
  parseKeybindingWhenExpression,
  parseWhenExpressionDraft,
  resolveKeybindingSurface,
  unknownWhenVariables,
  whenAstToExpression,
  whenExpressionsConflict,
  type KeybindingContext,
} from "../src/lib/keybinding-when"

const context = (extra: Partial<KeybindingContext> = {}): KeybindingContext =>
  keybindingContextFromSurface("thread", {
    ticketSelected: false,
    columnSelected: false,
    dialogOpen: false,
    commandPaletteOpen: false,
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

describe("parseKeybindingWhenExpression", () => {
  it("parses !, &&, || and parentheses", () => {
    expect(parseWhenExpressionDraft("")).toEqual({ ok: true, value: undefined })
    expect(parseWhenExpressionDraft("thread && (!dialogOpen || ticketSelected)")).toEqual({
      ok: true,
      value: parseKeybindingWhenExpression("thread && (!dialogOpen || ticketSelected)"),
    })
    expect(parseWhenExpressionDraft("thread &&")).toEqual({
      ok: false,
      message: "Use identifiers with !, &&, ||, and parentheses.",
    })
    expect(
      whenAstToExpression(parseKeybindingWhenExpression("!(thread || settings)") ?? undefined),
    ).toBe("!(thread || settings)")
  })

  it("keeps unknown identifiers for later runtime false", () => {
    const parsed = parseWhenExpressionDraft("!thread && terminalFocus")
    expect(parsed.ok).toBe(true)
    expect(unknownWhenVariables(parsed.ok ? parsed.value : undefined)).toEqual(["terminalFocus"])
  })
})

describe("matchesWhenClause", () => {
  it("treats a missing Condition as always true", () => {
    expect(matchesWhenClause(undefined, context({ dialogOpen: true }))).toBe(true)
  })

  it("evaluates boolean identifiers against the snapshot", () => {
    const when = parseKeybindingWhenExpression("thread && !dialogOpen")
    expect(when).not.toBeNull()
    if (when === null) {
      return
    }
    expect(evaluateWhenNode(when, context())).toBe(true)
    expect(
      evaluateWhenNode(
        when,
        keybindingContextFromSurface("tableau", {
          ticketSelected: false,
          columnSelected: false,
          dialogOpen: false,
          commandPaletteOpen: false,
          editableFocused: false,
        }),
      ),
    ).toBe(false)
    expect(evaluateWhenNode(when, context({ dialogOpen: true }))).toBe(false)
  })

  it("supports or groups", () => {
    const when = parseKeybindingWhenExpression("tableau || thread")
    expect(when).not.toBeNull()
    if (when === null) {
      return
    }
    expect(evaluateWhenNode(when, context())).toBe(true)
    expect(
      evaluateWhenNode(
        when,
        keybindingContextFromSurface("settings", {
          ticketSelected: false,
          columnSelected: false,
          dialogOpen: false,
          commandPaletteOpen: false,
          editableFocused: false,
        }),
      ),
    ).toBe(false)
  })
})

describe("whenExpressionsConflict", () => {
  it("conflicts when one side is always or both expressions are equal", () => {
    expect(whenExpressionsConflict("", "thread")).toBe(true)
    expect(whenExpressionsConflict("thread", "thread")).toBe(true)
    expect(whenExpressionsConflict("thread", "tableau")).toBe(false)
  })

  it("conflicts when two different Conditions can be true together", () => {
    expect(whenExpressionsConflict("thread", "!dialogOpen")).toBe(true)
    expect(whenExpressionsConflict("thread && dialogOpen", "thread && !dialogOpen")).toBe(false)
  })
})
