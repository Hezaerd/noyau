import { describe, expect, it } from "vite-plus/test"

import {
  ghosttyConsumedMods,
  ghosttyKeyForCode,
  ghosttyUnshiftedCodepoint,
} from "../src/terminal/ghostty/keyCodes"

describe("ghosttyKeyForCode", () => {
  it("maps W3C codes onto the Ghostty key enum", () => {
    expect(ghosttyKeyForCode("Unidentified")).toBe(0)
    expect(ghosttyKeyForCode("Enter")).toBeGreaterThan(0)
    expect(ghosttyKeyForCode("KeyA")).toBeGreaterThan(0)
    expect(ghosttyKeyForCode("not-a-key")).toBe(0)
  })
})

describe("ghosttyConsumedMods", () => {
  it("marks Shift consumed only for unchorded character input", () => {
    expect(
      ghosttyConsumedMods({
        altKey: false,
        ctrlKey: false,
        key: "A",
        metaKey: false,
        shiftKey: true,
      }),
    ).toBe(1)
    expect(
      ghosttyConsumedMods({
        altKey: false,
        ctrlKey: true,
        key: "A",
        metaKey: false,
        shiftKey: true,
      }),
    ).toBe(0)
    expect(
      ghosttyConsumedMods({
        altKey: false,
        ctrlKey: false,
        key: "Enter",
        metaKey: false,
        shiftKey: true,
      }),
    ).toBe(0)
  })
})

describe("ghosttyUnshiftedCodepoint", () => {
  it("uses the layout map when the browser exposes one", () => {
    expect(
      ghosttyUnshiftedCodepoint({ code: "Digit1", key: "!", shiftKey: true }, { get: () => "1" }),
    ).toBe("1".codePointAt(0))
  })

  it("unshifts US punctuation without a layout map", () => {
    expect(ghosttyUnshiftedCodepoint({ code: "Digit1", key: "!", shiftKey: true })).toBe(
      "1".codePointAt(0),
    )
    expect(ghosttyUnshiftedCodepoint({ code: "KeyA", key: "A", shiftKey: true })).toBe(
      "a".codePointAt(0),
    )
  })
})
