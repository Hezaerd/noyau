import { describe, expect, it } from "vite-plus/test"

import { gazeAxes, gazeTransform, lerpGaze, REST_GAZE } from "../src/lib/brand-gaze"

describe("brand gaze", () => {
  it("maps the window edges to a full look", () => {
    expect(gazeAxes(0, 0, 1440, 960)).toEqual({ nx: -1, ny: -1 })
    expect(gazeAxes(1440, 960, 1440, 960)).toEqual({ nx: 1, ny: 1 })
    expect(gazeAxes(720, 480, 1440, 960)).toEqual({ nx: 0, ny: 0 })
  })

  it("keeps moving past the sidebar instead of saturating", () => {
    const atSidebar = gazeAxes(256, 480, 1440, 960)
    const pastSidebar = gazeAxes(520, 480, 1440, 960)
    expect(atSidebar.nx).toBeGreaterThan(-1)
    expect(atSidebar.nx).toBeLessThan(0)
    expect(pastSidebar.nx).toBeGreaterThan(atSidebar.nx)
    expect(pastSidebar.nx).toBeLessThan(0)
  })

  it("clamps a cursor outside the window", () => {
    expect(gazeAxes(-40, -20, 1440, 960)).toEqual({ nx: -1, ny: -1 })
    expect(gazeAxes(2000, 1200, 1440, 960)).toEqual({ nx: 1, ny: 1 })
  })

  it("stays at rest when the content size is unusable", () => {
    expect(gazeAxes(100, 100, 0, 960)).toEqual({ nx: 0, ny: 0 })
  })

  it("looks farther right than left at full throw", () => {
    const right = gazeTransform(1, 0)
    const left = gazeTransform(-1, 0)
    expect(right.x).toBeGreaterThan(Math.abs(left.x))
    expect(right.scaleX).toBeLessThan(1)
  })

  it("lerps toward the target", () => {
    const next = lerpGaze(REST_GAZE, gazeTransform(1, 0), 0.5)
    expect(next.x).toBeGreaterThan(0)
    expect(next.x).toBeLessThan(gazeTransform(1, 0).x)
  })
})
