import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { RELEASE_CHANNELS } from "@noyau/shared/release-brand"

import { renderBootSplashSvg } from "../src/lib/boot-splash-svg.ts"

const require = createRequire(import.meta.url)
const scriptsDirectory = dirname(fileURLToPath(import.meta.url))
const publicDirectory = join(scriptsDirectory, "..", "public")
const motionCss = readFileSync(require.resolve("blobatar/motion.css"), "utf8")

mkdirSync(publicDirectory, { recursive: true })

for (const channel of RELEASE_CHANNELS) {
  const svgPath = join(publicDirectory, `boot-splash-${channel}.svg`)
  writeFileSync(svgPath, renderBootSplashSvg(channel, motionCss))
  process.stdout.write(`exported ${svgPath}\n`)
}
