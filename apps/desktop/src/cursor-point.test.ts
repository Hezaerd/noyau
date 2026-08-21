import { describe, expect, it } from "vite-plus/test"

import { cursorPointInContent } from "./cursor-point"

describe("cursor point in content", () => {
  const bounds = { x: 120, y: 80, width: 1440, height: 960 }

  it("maps the content origin to 0,0", () => {
    expect(cursorPointInContent({ x: 120, y: 80 }, bounds)).toEqual({
      x: 0,
      y: 0,
      width: 1440,
      height: 960,
    })
  })

  it("maps the far corner to the content size", () => {
    expect(cursorPointInContent({ x: 1560, y: 1040 }, bounds)).toEqual({
      x: 1440,
      y: 960,
      width: 1440,
      height: 960,
    })
  })
})
