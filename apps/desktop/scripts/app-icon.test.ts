import { describe, expect, it } from "@effect/vitest"

import { renderAppIconSvg } from "./app-icon-svg.ts"
import {
  APP_ICON_VARIANTS,
  MAC_BUNDLE_ICON_FILE,
  resolveAppIconDirectory,
  resolveAppIconPath,
  resolveAppIconPngPath,
  resolveAppIconVariant,
  resolveMacBundleIconPath,
  resolveMacBundleStockIconPath,
} from "./app-icon.ts"

describe("app icon", () => {
  it("uses the light sidebar blobatar for development and the dark one for production", () => {
    expect(resolveAppIconVariant(true)).toBe("development")
    expect(resolveAppIconVariant(false)).toBe("production")
    expect(APP_ICON_VARIANTS.development.appearance).toBe("light")
    expect(APP_ICON_VARIANTS.production.appearance).toBe("dark")
    expect(APP_ICON_VARIANTS.development.palette).toEqual({
      bg: "#ebe9f4",
      head: "#6154e0",
      eye: "#f7f5ff",
    })
    expect(APP_ICON_VARIANTS.production.palette).toEqual({
      bg: "#0a0a0e",
      head: "#302b4b",
      eye: "#e2ddff",
    })
    expect(APP_ICON_VARIANTS.nightly.directory).toBe("nightly")
    expect(APP_ICON_VARIANTS.nightly.palette).toEqual({
      bg: "#1a1208",
      head: "#c45c26",
      eye: "#ffe7c2",
    })
  })

  it("points each variant at its committed icns and png", () => {
    expect(resolveAppIconPath("/repo/apps/desktop", true)).toBe(
      "/repo/apps/desktop/assets/dev/app-icon.icns",
    )
    expect(resolveAppIconPath("/repo/apps/desktop", false)).toBe(
      "/repo/apps/desktop/assets/prod/app-icon.icns",
    )
    expect(resolveAppIconPngPath("/repo/apps/desktop", true)).toBe(
      "/repo/apps/desktop/assets/dev/app-icon.png",
    )
    expect(resolveAppIconPngPath("/repo/apps/desktop", false)).toBe(
      "/repo/apps/desktop/assets/prod/app-icon.png",
    )
    expect(`${resolveAppIconDirectory("/repo/apps/desktop", "nightly")}/app-icon.icns`).toBe(
      "/repo/apps/desktop/assets/nightly/app-icon.icns",
    )
    expect(MAC_BUNDLE_ICON_FILE).toBe("icon.icns")
    expect(resolveMacBundleIconPath("/repo/Noyau (Dev).app")).toBe(
      "/repo/Noyau (Dev).app/Contents/Resources/icon.icns",
    )
    expect(resolveMacBundleStockIconPath("/repo/Noyau (Dev).app")).toBe(
      "/repo/Noyau (Dev).app/Contents/Resources/electron.icns",
    )
  })

  it("renders the variant palette into the SVG", () => {
    const development = renderAppIconSvg("development")
    const production = renderAppIconSvg("production")

    expect(development).toContain("#ebe9f4")
    expect(development).toContain("#6154e0")
    expect(development).toContain("#f7f5ff")
    expect(production).toContain("#0a0a0e")
    expect(production).toContain("#302b4b")
    expect(production).toContain("#e2ddff")
    expect(development).not.toBe(production)
    expect(renderAppIconSvg("nightly")).toContain("#c45c26")
    expect(renderAppIconSvg("nightly")).not.toBe(production)
  })
})
