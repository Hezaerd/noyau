import { describe, expect, it } from "vite-plus/test"

import { parseCssColor } from "../src/terminal/ghostty/theme"

describe("parseCssColor", () => {
  it("parses 6-digit and 3-digit hex", () => {
    expect(parseCssColor("#f5f4fb")).toEqual({ r: 245, g: 244, b: 251 })
    expect(parseCssColor("#0f0")).toEqual({ r: 0, g: 255, b: 0 })
  })

  it("parses rgb() with commas or spaces", () => {
    expect(parseCssColor("rgb(28, 27, 38)")).toEqual({ r: 28, g: 27, b: 38 })
    expect(parseCssColor("rgb(15 15 19)")).toEqual({ r: 15, g: 15, b: 19 })
  })

  it("returns null for unknown values", () => {
    expect(parseCssColor("")).toBeNull()
    expect(parseCssColor("transparent")).toBeNull()
  })
})
