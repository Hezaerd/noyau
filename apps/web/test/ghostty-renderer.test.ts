import { describe, expect, it } from "vite-plus/test"

import type { GhosttyCell } from "../src/terminal/ghostty/core"
import { shouldBlinkTerminalCursor } from "../src/terminal/ghostty/cursor"
import { ghosttyTextRunEnd, terminalGridSize } from "../src/terminal/ghostty/renderer"

const cell = (text: string, extras: Partial<GhosttyCell> = {}): GhosttyCell => ({
  text,
  wide: 0,
  foreground: { r: 255, g: 255, b: 255 },
  background: { r: 0, g: 0, b: 0 },
  bold: false,
  italic: false,
  invisible: false,
  strikethrough: false,
  overline: false,
  underline: false,
  selected: false,
  ...extras,
})

describe("terminalGridSize", () => {
  it("fits at least one cell and subtracts padding", () => {
    expect(terminalGridSize(0, 0, { width: 8, height: 16, baseline: 12 }, 4)).toEqual({
      cols: 1,
      rows: 1,
    })
    expect(terminalGridSize(84, 36, { width: 8, height: 16, baseline: 12 }, 4)).toEqual({
      cols: 9,
      rows: 1,
    })
  })
})

describe("ghosttyTextRunEnd", () => {
  it("extends a run while the style matches", () => {
    const cells = [cell("a"), cell("b"), cell("c", { bold: true })]
    expect(ghosttyTextRunEnd(cells, 0, (next) => next.bold === cells[0]?.bold)).toBe(2)
  })
})

describe("shouldBlinkTerminalCursor", () => {
  it("blinks only when focused, blinking, visible, and motion is allowed", () => {
    expect(shouldBlinkTerminalCursor(true, true, true, false)).toBe(true)
    expect(shouldBlinkTerminalCursor(false, true, true, false)).toBe(false)
    expect(shouldBlinkTerminalCursor(true, true, true, true)).toBe(false)
  })
})
