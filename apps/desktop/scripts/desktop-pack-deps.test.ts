import { describe, expect, it } from "@effect/vitest"

import { desktopPackNeverBundle, isDesktopAlwaysBundled } from "./desktop-pack-deps.ts"

describe("desktop pack deps", () => {
  it("keeps the Electron runtime module external", () => {
    expect(desktopPackNeverBundle).toEqual(["electron"])
    expect(isDesktopAlwaysBundled("electron")).toBe(false)
    expect(isDesktopAlwaysBundled("electron/main")).toBe(false)
  })

  it("bundles Noyau and Effect into the desktop artifacts", () => {
    expect(isDesktopAlwaysBundled("@noyau/contracts")).toBe(true)
    expect(isDesktopAlwaysBundled("effect")).toBe(true)
    expect(isDesktopAlwaysBundled("@effect/platform-node")).toBe(true)
    expect(isDesktopAlwaysBundled("effect/unstable/http")).toBe(true)
  })
})
