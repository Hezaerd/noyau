import { describe, expect, it } from "vite-plus/test"

import { encodeTerminalKey } from "../src/lib/terminal-key"

const key = (partial: Partial<KeyboardEvent> & Pick<KeyboardEvent, "key">): KeyboardEvent =>
  partial as KeyboardEvent

describe("encodeTerminalKey", () => {
  it("encode Enter, Backspace et les flèches", () => {
    expect(encodeTerminalKey(key({ key: "Enter" }))).toBe("\r")
    expect(encodeTerminalKey(key({ key: "Backspace" }))).toBe("\u007f")
    expect(encodeTerminalKey(key({ key: "ArrowUp" }))).toBe("\u001b[A")
    expect(encodeTerminalKey(key({ key: "a" }))).toBe("a")
  })

  it("encode Ctrl+C / Ctrl+D et ignore les accords non gérés", () => {
    expect(encodeTerminalKey(key({ key: "c", ctrlKey: true }))).toBe("\u0003")
    expect(encodeTerminalKey(key({ key: "d", ctrlKey: true }))).toBe("\u0004")
    expect(encodeTerminalKey(key({ key: "k", ctrlKey: true }))).toBeNull()
    expect(encodeTerminalKey(key({ key: "Shift" }))).toBeNull()
  })
})
