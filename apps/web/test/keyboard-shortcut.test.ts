import { describe, expect, it } from "vite-plus/test"

import {
  getHotkeysPlatform,
  getShortcutSegments,
  HOTKEY_COMMAND_PALETTE,
  paletteItemHotkey,
} from "../src/lib/keyboard-shortcut"

describe("keyboard-shortcut", () => {
  it.each([
    ["MacIntel", "mac"],
    ["Macintosh", "mac"],
    ["macOS", "mac"],
    ["darwin", "mac"],
    ["Win32", "windows"],
    ["Windows", "windows"],
    ["win32", "windows"],
    ["Linux x86_64", "linux"],
    ["linux", "linux"],
  ] as const)("maps %s to hotkeys platform %s", (platform, hotkeysPlatform) => {
    expect(getHotkeysPlatform(platform)).toBe(hotkeysPlatform)
  })

  it("formats command palette shortcut for macOS", () => {
    expect(getShortcutSegments(HOTKEY_COMMAND_PALETTE, "mac")).toEqual(["⌘", "K"])
  })

  it("formats Electron darwin platform as macOS shortcuts", () => {
    const platform = getHotkeysPlatform("darwin")
    expect(getShortcutSegments(HOTKEY_COMMAND_PALETTE, platform)).toEqual(["⌘", "K"])
    expect(paletteItemHotkey(0, platform)).toBe("Mod+1")
  })

  it("formats command palette shortcut for Windows", () => {
    expect(getShortcutSegments(HOTKEY_COMMAND_PALETTE, "windows")).toEqual(["Ctrl", "K"])
  })

  it("formats settings shortcut for macOS and Windows", () => {
    expect(getShortcutSegments("Mod+,", "mac")).toEqual(["⌘", ","])
    expect(getShortcutSegments("Mod+,", "windows")).toEqual(["Ctrl", ","])
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

  it("builds palette item hotkeys per platform", () => {
    expect(paletteItemHotkey(0, "mac")).toBe("Mod+1")
    expect(paletteItemHotkey(0, "windows")).toBe("Alt+1")
  })
})
