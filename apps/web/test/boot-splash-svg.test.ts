/// <reference types="node" />

import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { RELEASE_BRANDS, RELEASE_CHANNELS } from "@noyau/shared/release-brand"
import { describe, expect, it } from "vite-plus/test"

import { renderBootSplashSvg } from "../src/lib/boot-splash-svg"

const require = createRequire(import.meta.url)
const motionCss = readFileSync(require.resolve("blobatar/motion.css"), "utf8")
const publicDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "public")

describe("boot splash svg", () => {
  it("bake motion.css, always et thinking dans un SVG autonome", () => {
    const svg = renderBootSplashSvg("latest", motionCss)

    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain("<style><![CDATA[")
    expect(svg).toContain(".mo-root.mo-always")
    expect(svg).toContain("mo-root mo-always mo-expr")
    expect(svg).toContain("--mo-phase:")
    expect(svg).toContain(`fill="${RELEASE_BRANDS.latest.palette.head}"`)
    expect(svg).toContain(`fill="${RELEASE_BRANDS.latest.palette.background}"`)
  })

  it("garde un SVG par canal aligné sur le renderer", () => {
    for (const channel of RELEASE_CHANNELS) {
      const expected = renderBootSplashSvg(channel, motionCss)
      const actual = readFileSync(join(publicDirectory, `boot-splash-${channel}.svg`), "utf8")
      expect(actual).toBe(expected)
    }
  })
})
