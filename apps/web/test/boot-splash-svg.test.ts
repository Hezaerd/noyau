/// <reference types="node" />
/// <reference types="vite/client" />

import { createRequire } from "node:module"

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { RELEASE_BRANDS, RELEASE_CHANNELS, type ReleaseChannel } from "@noyau/shared/release-brand"
import { Effect, FileSystem, ManagedRuntime } from "effect"
import { describe, expect, it } from "vitest"

import developmentSplash from "../public/boot-splash-development.svg?raw"
import latestSplash from "../public/boot-splash-latest.svg?raw"
import nightlySplash from "../public/boot-splash-nightly.svg?raw"
import { renderBootSplashSvg } from "../src/lib/boot-splash-svg"

const require = createRequire(import.meta.url)
const fileRuntime = ManagedRuntime.make(NodeFileSystem.layer)
const motionCss = await fileRuntime.runPromise(
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem
    return yield* fileSystem.readFileString(require.resolve("blobatar/motion.css"))
  }),
)

const publicSplashes = {
  development: developmentSplash,
  latest: latestSplash,
  nightly: nightlySplash,
} as const satisfies Record<ReleaseChannel, string>

describe("boot splash svg", () => {
  it("bake motion.css, always et thinking dans un SVG autonome", () => {
    const svg = renderBootSplashSvg("latest", motionCss)

    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain("<style><![CDATA[")
    expect(svg).toContain(".mo-root.mo-always")
    expect(svg).toContain("mo-root mo-always mo-expr")
    expect(svg).toContain("--mo-phase:")
    expect(svg).toContain(`fill="${RELEASE_BRANDS.latest.palette.head}"`)
    expect(svg).not.toContain(`fill="${RELEASE_BRANDS.latest.palette.background}"`)
    expect(svg).not.toContain('d="M0 0H100V100H0Z"')
  })

  it("garde un SVG par canal aligné sur le renderer", () => {
    for (const channel of RELEASE_CHANNELS) {
      const expected = renderBootSplashSvg(channel, motionCss)
      expect(publicSplashes[channel]).toBe(expected)
    }
  })
})
