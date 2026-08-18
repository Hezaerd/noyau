import { describe, expect, it } from "vite-plus/test"

import {
  getHotkeysPlatform,
  getShortcutSegments,
  HOTKEY_COMMAND_PALETTE,
} from "../src/lib/keyboard-shortcut"

describe("keyboard-shortcut", () => {
  it.each([
    ["MacIntel", "mac"],
    ["Win32", "windows"],
    ["Linux x86_64", "linux"],
  ] as const)("maps %s to hotkeys platform %s", (platform, hotkeysPlatform) => {
    expect(getHotkeysPlatform(platform)).toBe(hotkeysPlatform)
  })

  it("formats command palette shortcut for macOS", () => {
    expect(getShortcutSegments(HOTKEY_COMMAND_PALETTE, "mac")).toEqual(["⌘", "K"])
  })

  it("formats command palette shortcut for Windows", () => {
    expect(getShortcutSegments(HOTKEY_COMMAND_PALETTE, "windows")).toEqual(["Ctrl", "K"])
  })

  it("formats mod+enter for macOS and Windows", () => {
    expect(getShortcutSegments("Mod+Enter", "mac")).toEqual(["⌘", "↵"])
    expect(getShortcutSegments("Mod+Enter", "windows")).toEqual(["Ctrl", "↵"])
  })

  it("formats single-key shortcuts", () => {
    expect(getShortcutSegments("/", "mac")).toEqual(["/"])
    expect(getShortcutSegments("C", "windows")).toEqual(["C"])
  })

  it("formats shift combinations", () => {
    expect(getShortcutSegments("Shift+Enter", "mac")).toEqual(["⇧", "↵"])
    expect(getShortcutSegments("Shift+Enter", "windows")).toEqual(["Shift", "↵"])
  })
})
