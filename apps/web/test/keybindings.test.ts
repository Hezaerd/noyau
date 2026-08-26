// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vite-plus/test"

import { dispatchKeybindingEvent } from "../src/hooks/use-keybinding-dispatcher"
import type { KeybindingConditionSnapshot } from "../src/lib/keybinding-when"
import {
  keybindingConflicts,
  resolveKeybindings,
  resolveMatchingKeybinding,
} from "../src/lib/keybindings"
import { resetAppAtomRegistryForTests } from "../src/state/atom-registry"
import {
  readKeybindingConditionSnapshot,
  setKeybindingPaletteOpen,
} from "../src/state/keybinding-context"
import {
  invokeKeybindingHandler,
  registerKeybindingHandler,
  resetKeybindingHandlersForTests,
} from "../src/state/keybinding-handlers"
import { setKeybindingRecorderActive } from "../src/state/keybindings"

const resolved = resolveKeybindings(new Map())

const snapshot = (
  extra: Partial<KeybindingConditionSnapshot> = {},
): KeybindingConditionSnapshot => ({
  surface: undefined,
  ticketSelected: false,
  columnSelected: false,
  dialogOpen: false,
  editableFocused: false,
  ...extra,
})

const keyEvent = (init: KeyboardEventInit): KeyboardEvent => new KeyboardEvent("keydown", init)

afterEach(() => {
  resetKeybindingHandlersForTests()
  resetAppAtomRegistryForTests()
  setKeybindingRecorderActive(false)
})

describe("keybindingConflicts", () => {
  it("treats F2 as free when Conditions cannot be true together", () => {
    expect(keybindingConflicts("thread.rename", "F2", resolved, "mac")).toEqual([])
    expect(keybindingConflicts("board.ticket.rename", "F2", resolved, "mac")).toEqual([])
    expect(keybindingConflicts("board.column.rename", "F2", resolved, "mac")).toEqual([])
  })

  it("flags the same Raccourci when Conditions overlap", () => {
    expect(keybindingConflicts("palette.open", "Mod+,", resolved, "mac")).toEqual(["settings.open"])
    expect(keybindingConflicts("settings.open", "Mod+K", resolved, "mac")).toEqual(["palette.open"])
  })

  it("lets Tableau and Paramètres share /", () => {
    expect(keybindingConflicts("board.search", "/", resolved, "mac")).toEqual([])
    expect(keybindingConflicts("settings.search", "/", resolved, "mac")).toEqual([])
  })
})

describe("resolveMatchingKeybinding", () => {
  it("opens the model picker only on a Thread", () => {
    const event = keyEvent({ key: ";", metaKey: true, ctrlKey: false })
    expect(resolveMatchingKeybinding(event, resolved, snapshot({ surface: "thread" }), "mac")).toBe(
      "thread.model-picker.open",
    )
    expect(
      resolveMatchingKeybinding(event, resolved, snapshot({ surface: "tableau" }), "mac"),
    ).toBeUndefined()
  })

  it("picks the more specific Condition when two Raccourcis match", () => {
    const event = keyEvent({ key: "F2" })
    expect(
      resolveMatchingKeybinding(
        event,
        resolved,
        snapshot({ surface: "tableau", ticketSelected: true }),
        "mac",
      ),
    ).toBe("board.ticket.rename")
    expect(
      resolveMatchingKeybinding(
        event,
        resolved,
        snapshot({ surface: "tableau", columnSelected: true, ticketSelected: false }),
        "mac",
      ),
    ).toBe("board.column.rename")
    expect(resolveMatchingKeybinding(event, resolved, snapshot({ surface: "thread" }), "mac")).toBe(
      "thread.rename",
    )
  })

  it("blocks page Keybindings while a Dialog or an editable is focused", () => {
    const event = keyEvent({ key: "k", metaKey: true })
    expect(
      resolveMatchingKeybinding(event, resolved, snapshot({ dialogOpen: true }), "mac"),
    ).toBeUndefined()
    expect(
      resolveMatchingKeybinding(event, resolved, snapshot({ editableFocused: true }), "mac"),
    ).toBeUndefined()
    expect(resolveMatchingKeybinding(event, resolved, snapshot(), "mac")).toBe("palette.open")
  })
})

describe("readKeybindingConditionSnapshot", () => {
  it("ignores the Palette when computing dialogOpen", () => {
    const event = keyEvent({ key: "n", metaKey: true })
    setKeybindingPaletteOpen(true)
    expect(readKeybindingConditionSnapshot(event, "/projects/abc/board").dialogOpen).toBe(false)
  })
})

describe("dispatchKeybindingEvent", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "noyauDesktop")
  })

  it("invokes the registered handler and swallows the event", () => {
    Object.defineProperty(window, "noyauDesktop", {
      configurable: true,
      value: { platform: "darwin" },
    })
    let opened = false
    registerKeybindingHandler("palette.open", () => {
      opened = true
    })
    const event = keyEvent({ key: "k", metaKey: true, bubbles: true, cancelable: true })
    Object.defineProperty(event, "target", { value: document.body })
    expect(dispatchKeybindingEvent(event)).toBe(true)
    expect(opened).toBe(true)
    expect(event.defaultPrevented).toBe(true)
  })

  it("does nothing while the recorder is active", () => {
    let opened = false
    registerKeybindingHandler("palette.open", () => {
      opened = true
    })
    setKeybindingRecorderActive(true)
    const event = keyEvent({ key: "k", metaKey: true, cancelable: true })
    Object.defineProperty(event, "target", { value: document.body })
    expect(dispatchKeybindingEvent(event)).toBe(false)
    expect(opened).toBe(false)
  })
})

describe("keybinding handlers", () => {
  it("unregisters the exact handler on dispose", () => {
    const first = registerKeybindingHandler("thread.pin", () => undefined)
    first()
    expect(invokeKeybindingHandler("thread.pin")).toBe(false)
  })
})
