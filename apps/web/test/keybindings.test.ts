// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vite-plus/test"

import { dispatchKeybindingEvent } from "../src/hooks/use-keybinding-dispatcher"
import {
  isDialogOpen,
  keybindingContextFromSurface,
  type KeybindingContext,
} from "../src/lib/keybinding-when"
import {
  compileAndMergeKeybindings,
  DEFAULT_RESOLVED_KEYBINDINGS,
  keybindingConflicts,
  keybindingTombstone,
  resolveKeybindings,
  resolveMatchingKeybinding,
  upsertKeybindingRule,
} from "../src/lib/keybindings"
import { keybindingFromKeyboardEvent } from "../src/lib/keybindings-settings"
import { parseKeybindingsRules, serializeKeybindingsRules } from "../src/lib/keybinds-file"
import { resetAppAtomRegistryForTests } from "../src/state/atom-registry"
import { readKeybindingContext, setKeybindingPaletteOpen } from "../src/state/keybinding-context"
import {
  invokeKeybindingHandler,
  registerKeybindingHandler,
  resetKeybindingHandlersForTests,
} from "../src/state/keybinding-handlers"
import { setKeybindingRecorderActive } from "../src/state/keybindings"

const merged = compileAndMergeKeybindings([])

const context = (extra: Partial<KeybindingContext> = {}): KeybindingContext =>
  keybindingContextFromSurface(
    extra.thread ? "thread" : extra.tableau ? "tableau" : extra.settings ? "settings" : undefined,
    {
      ticketSelected: extra.ticketSelected ?? false,
      columnSelected: extra.columnSelected ?? false,
      dialogOpen: extra.dialogOpen ?? false,
      commandPaletteOpen: extra.commandPaletteOpen ?? false,
      editableFocused: extra.editableFocused ?? false,
    },
  )

const keyEvent = (init: KeyboardEventInit): KeyboardEvent => new KeyboardEvent("keydown", init)

afterEach(() => {
  resetKeybindingHandlersForTests()
  resetAppAtomRegistryForTests()
  setKeybindingRecorderActive(false)
})

describe("keybindingConflicts", () => {
  it("treats F2 as free when Conditions cannot be true together", () => {
    expect(
      keybindingConflicts(
        "thread.rename",
        "f2",
        merged,
        "thread && !dialogOpen && !editableFocused",
      ),
    ).toEqual([])
    expect(
      keybindingConflicts(
        "board.ticket.rename",
        "f2",
        merged,
        "tableau && ticketSelected && !dialogOpen && !editableFocused",
      ),
    ).toEqual([])
    expect(
      keybindingConflicts(
        "board.column.rename",
        "f2",
        merged,
        "tableau && columnSelected && !ticketSelected && !dialogOpen && !editableFocused",
      ),
    ).toEqual([])
  })

  it("flags the same Raccourci when a Condition is always", () => {
    expect(keybindingConflicts("settings.open", "mod+k", merged)).toEqual(["palette.open"])
    expect(
      keybindingConflicts("palette.open", "mod+,", merged, "!dialogOpen && !editableFocused"),
    ).toEqual(["settings.open"])
  })

  it("lets Tableau and Paramètres share /", () => {
    expect(
      keybindingConflicts(
        "board.search",
        "/",
        merged,
        "tableau && !dialogOpen && !editableFocused",
      ),
    ).toEqual([])
    expect(
      keybindingConflicts(
        "settings.search",
        "/",
        merged,
        "settings && !dialogOpen && !editableFocused",
      ),
    ).toEqual([])
  })
})

describe("resolveMatchingKeybinding", () => {
  it("toggles the workspace panel with mod+shift+b unless the Palette is open", () => {
    const event = keyEvent({ key: "b", metaKey: true, shiftKey: true })
    expect(resolveMatchingKeybinding(event, merged, context({ thread: true }), "mac")).toBe(
      "thread.workspace-panel.toggle",
    )
    expect(
      resolveMatchingKeybinding(
        event,
        merged,
        context({ thread: true, commandPaletteOpen: true }),
        "mac",
      ),
    ).toBeUndefined()
    expect(
      resolveMatchingKeybinding(event, merged, context({ tableau: true }), "mac"),
    ).toBeUndefined()
    expect(
      resolveMatchingKeybinding(event, merged, context({ thread: true, dialogOpen: true }), "mac"),
    ).toBeUndefined()
    expect(
      resolveMatchingKeybinding(
        event,
        merged,
        context({ thread: true, editableFocused: true }),
        "mac",
      ),
    ).toBeUndefined()
  })

  it("opens a browser tab with mod+shift+t while the address field can be focused", () => {
    const event = keyEvent({ key: "t", metaKey: true, shiftKey: true })
    expect(resolveMatchingKeybinding(event, merged, context({ thread: true }), "mac")).toBe(
      "thread.workspace-browser.open",
    )
    expect(
      resolveMatchingKeybinding(
        event,
        merged,
        context({ thread: true, editableFocused: true }),
        "mac",
      ),
    ).toBe("thread.workspace-browser.open")
    expect(
      resolveMatchingKeybinding(
        event,
        merged,
        context({ thread: true, commandPaletteOpen: true }),
        "mac",
      ),
    ).toBeUndefined()
    expect(
      resolveMatchingKeybinding(event, merged, context({ tableau: true }), "mac"),
    ).toBeUndefined()
  })

  it("opens the model picker only on a Thread", () => {
    const event = keyEvent({ key: ";", metaKey: true, ctrlKey: false })
    expect(resolveMatchingKeybinding(event, merged, context({ thread: true }), "mac")).toBe(
      "thread.model-picker.open",
    )
    expect(
      resolveMatchingKeybinding(event, merged, context({ tableau: true }), "mac"),
    ).toBeUndefined()
  })

  it("lets the last matching rule win for F2", () => {
    const event = keyEvent({ key: "F2" })
    expect(
      resolveMatchingKeybinding(
        event,
        merged,
        context({ tableau: true, ticketSelected: true }),
        "mac",
      ),
    ).toBe("board.ticket.rename")
    expect(
      resolveMatchingKeybinding(
        event,
        merged,
        context({ tableau: true, columnSelected: true, ticketSelected: false }),
        "mac",
      ),
    ).toBe("board.column.rename")
    expect(resolveMatchingKeybinding(event, merged, context({ thread: true }), "mac")).toBe(
      "thread.rename",
    )
  })

  it("blocks page Keybindings while a Dialog or an editable is focused", () => {
    const event = keyEvent({ key: "k", metaKey: true })
    expect(
      resolveMatchingKeybinding(event, merged, context({ dialogOpen: true }), "mac"),
    ).toBeUndefined()
    expect(
      resolveMatchingKeybinding(event, merged, context({ editableFocused: true }), "mac"),
    ).toBeUndefined()
    expect(resolveMatchingKeybinding(event, merged, context(), "mac")).toBe("palette.open")
  })

  it("lets a later rule steal a Raccourci from an earlier command", () => {
    const rules = upsertKeybindingRule([], {
      key: "mod+k",
      command: "settings.open",
      when: "settings",
    })
    const compiled = compileAndMergeKeybindings(rules)
    const event = keyEvent({ key: "k", metaKey: true })
    expect(resolveMatchingKeybinding(event, compiled, context({ settings: true }), "mac")).toBe(
      "settings.open",
    )
    expect(resolveMatchingKeybinding(event, compiled, context(), "mac")).toBe("palette.open")
  })
})

describe("readKeybindingContext", () => {
  it("ignores the Palette when computing dialogOpen", () => {
    const event = keyEvent({ key: "n", metaKey: true })
    setKeybindingPaletteOpen(true)
    expect(readKeybindingContext(event.target, "/projects/abc/board").dialogOpen).toBe(false)
    expect(readKeybindingContext(event.target, "/projects/abc/board").commandPaletteOpen).toBe(true)
    expect(readKeybindingContext(event.target, "/projects/abc/board").tableau).toBe(true)
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

  it("does not swallow the event when no handler is registered", () => {
    Object.defineProperty(window, "noyauDesktop", {
      configurable: true,
      value: { platform: "darwin" },
    })
    const event = keyEvent({ key: "k", metaKey: true, bubbles: true, cancelable: true })
    Object.defineProperty(event, "target", { value: document.body })
    expect(dispatchKeybindingEvent(event)).toBe(false)
    expect(event.defaultPrevented).toBe(false)
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

describe("keybindings.json", () => {
  it("round-trips a flat rule array", () => {
    const parsed = parseKeybindingsRules(
      JSON.stringify([
        { key: "mod+j", command: "palette.open" },
        { key: "mod+p", command: "palette.open", when: "settings" },
      ]),
    )
    expect(parsed).toEqual([
      { key: "mod+j", command: "palette.open" },
      { key: "mod+p", command: "palette.open", when: "settings" },
    ])
    expect(parseKeybindingsRules(serializeKeybindingsRules(parsed))).toEqual(parsed)
  })

  it("ignores a payload that is not a rule array", () => {
    expect(parseKeybindingsRules("{")).toEqual([])
    expect(
      parseKeybindingsRules(
        JSON.stringify({
          version: 1,
          bindings: [{ command: "palette.open", key: "mod+j" }],
        }),
      ),
    ).toEqual([])
  })

  it("drops an entry with an invalid key or when", () => {
    expect(
      parseKeybindingsRules(
        JSON.stringify([
          { key: "mod+j", command: "palette.open" },
          { key: "mod", command: "settings.open" },
          { key: "mod+k", command: "thread.create", when: "thread &&" },
        ]),
      ),
    ).toEqual([{ key: "mod+j", command: "palette.open" }])
  })

  it("drops a persisted when that exceeds the length limit", () => {
    const when = `${"tableau && ".repeat(40)}tableau`
    expect(when.length).toBeGreaterThan(256)
    expect(
      parseKeybindingsRules(JSON.stringify([{ key: "mod+j", command: "palette.open", when }])),
    ).toEqual([])
  })

  it("keeps a tombstone from restoring the default command", () => {
    const compiled = compileAndMergeKeybindings([keybindingTombstone("palette.open")])
    expect(compiled.some((binding) => binding.command === "palette.open")).toBe(false)
    expect(compiled.length).toBe(DEFAULT_RESOLVED_KEYBINDINGS.length - 1)
  })

  it("dispatches an extra rule when the default does not match", () => {
    const compiled = compileAndMergeKeybindings([
      { key: "mod+p", command: "palette.open", when: "settings" },
    ])
    const event = keyEvent({ key: "p", metaKey: true })
    expect(resolveMatchingKeybinding(event, compiled, context({ settings: true }), "mac")).toBe(
      "palette.open",
    )
  })
})

describe("resolveKeybindings labels", () => {
  it("exposes tanstack labels for chrome", () => {
    const resolved = resolveKeybindings()
    expect(resolved["palette.open"]).toBe("Mod+K")
    expect(resolved["settings.open"]).toBe("Mod+,")
    expect(DEFAULT_RESOLVED_KEYBINDINGS.length).toBeGreaterThan(0)
  })
})

describe("keybindingFromKeyboardEvent", () => {
  it("captures platform-specific mod shortcuts and bare keys", () => {
    expect(
      keybindingFromKeyboardEvent(
        { key: "K", metaKey: true, ctrlKey: false, altKey: false, shiftKey: true },
        "MacIntel",
      ),
    ).toBe("mod+shift+k")
    expect(
      keybindingFromKeyboardEvent(
        { key: "K", metaKey: false, ctrlKey: true, altKey: false, shiftKey: true },
        "Win32",
      ),
    ).toBe("mod+shift+k")
    expect(
      keybindingFromKeyboardEvent(
        { key: "/", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false },
        "MacIntel",
      ),
    ).toBe("/")
  })
})

describe("keybinding handlers", () => {
  it("unregisters the exact handler on dispose", () => {
    const first = registerKeybindingHandler("thread.pin", () => undefined)
    first()
    expect(invokeKeybindingHandler("thread.pin")).toBe(false)
  })
})

describe("isDialogOpen", () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it("ignores a modal context menu and a hidden leftover dialog", () => {
    const menu = document.createElement("div")
    menu.setAttribute("role", "menu")
    menu.setAttribute("aria-modal", "true")
    document.body.append(menu)
    expect(isDialogOpen()).toBe(false)

    const hidden = document.createElement("div")
    hidden.setAttribute("role", "dialog")
    hidden.hidden = true
    document.body.append(hidden)
    expect(isDialogOpen()).toBe(false)

    const collapsed = document.createElement("div")
    collapsed.setAttribute("role", "dialog")
    collapsed.style.visibility = "collapse"
    document.body.append(collapsed)
    expect(isDialogOpen()).toBe(false)

    const dialog = document.createElement("div")
    dialog.setAttribute("role", "dialog")
    document.body.append(dialog)
    expect(isDialogOpen()).toBe(true)
  })
})
