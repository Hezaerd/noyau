/// <reference types="node" />

import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import { RELEASE_CHANNELS } from "@noyau/shared/release-brand"
import { Console, Effect, FileSystem, Layer, Path } from "effect"

import { renderBootSplashSvg } from "../src/lib/boot-splash-svg.ts"

const require = createRequire(import.meta.url)

const program = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url))
  const publicDirectory = path.join(scriptsDirectory, "..", "public")
  const motionCss = yield* fileSystem.readFileString(require.resolve("blobatar/motion.css"))
  yield* fileSystem.makeDirectory(publicDirectory, { recursive: true })

  for (const channel of RELEASE_CHANNELS) {
    const svgPath = path.join(publicDirectory, `boot-splash-${channel}.svg`)
    yield* fileSystem.writeFileString(svgPath, renderBootSplashSvg(channel, motionCss))
    yield* Console.log(`exported ${svgPath}`)
  }
})

Layer.build(
  Layer.effectDiscard(program).pipe(Layer.provide(Layer.merge(NodeFileSystem.layer, Path.layer))),
).pipe(Effect.scoped, NodeRuntime.runMain)
