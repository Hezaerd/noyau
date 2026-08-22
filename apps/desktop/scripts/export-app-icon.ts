import * as NodeOS from "node:os"
import { fileURLToPath } from "node:url"

import { Effect, FileSystem, Path, Schema, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"

import { renderAppIconSvg } from "./app-icon-svg.ts"
import {
  APP_ICON_SIZE,
  APP_ICON_VARIANTS,
  resolveAppIconDirectory,
  type AppIconVariant,
} from "./app-icon.ts"
import { scriptRuntime } from "./runtime.ts"

const ICONSET_SIZES = [16, 32, 128, 256, 512] as const

class AppIconExportError extends Schema.TaggedError<AppIconExportError>()("AppIconExportError", {
  message: Schema.String,
}) {}

const collectProcessOutput = Effect.fn("collectProcessOutput")(function* (
  command: string,
  args: ReadonlyArray<string>,
) {
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* ChildProcess.make(command, args, {
        stdout: "pipe",
        stderr: "pipe",
      })
      const [exit, stdout, stderr] = yield* Effect.all(
        [
          handle.exitCode.pipe(Effect.orElseSucceed(() => 1)),
          Stream.mkString(Stream.decodeText(handle.stdout)),
          Stream.mkString(Stream.decodeText(handle.stderr)),
        ],
        { concurrency: "unbounded" },
      )
      return { status: Number(exit), stdout, stderr }
    }),
  )
})

const runCommand = Effect.fn("runCommand")(function* (
  command: string,
  args: ReadonlyArray<string>,
  failure: string,
) {
  const result = yield* collectProcessOutput(command, args)
  if (result.status === 0) {
    return
  }

  const details = [result.stdout, result.stderr].filter(Boolean).join("\n")
  return yield* new AppIconExportError({
    message: `${failure}: ${details}`.trim(),
  })
})

const exportVariant = Effect.fn("exportVariant")(function* (variant: AppIconVariant) {
  const path = yield* Path.Path
  const fs = yield* FileSystem.FileSystem
  const desktopDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  const assetDirectory = resolveAppIconDirectory(desktopDirectory, variant)
  const svgPath = path.join(assetDirectory, "app-icon.svg")
  const pngPath = path.join(assetDirectory, "app-icon.png")
  const icnsPath = path.join(assetDirectory, "app-icon.icns")
  const iconsetDirectory = path.join(
    NodeOS.tmpdir(),
    `noyau-app-icon-${APP_ICON_VARIANTS[variant].directory}.iconset`,
  )

  yield* fs.makeDirectory(assetDirectory, { recursive: true })
  yield* fs.writeFileString(svgPath, `${renderAppIconSvg(variant)}\n`)
  yield* runCommand(
    "sips",
    ["-s", "format", "png", svgPath, "--out", pngPath],
    `Failed to rasterize ${variant} app icon`,
  )
  yield* fs.remove(iconsetDirectory, { recursive: true, force: true })
  yield* fs.makeDirectory(iconsetDirectory, { recursive: true })

  for (const size of ICONSET_SIZES) {
    yield* runCommand(
      "sips",
      [
        "-z",
        String(size),
        String(size),
        pngPath,
        "--out",
        path.join(iconsetDirectory, `icon_${size}x${size}.png`),
      ],
      `Failed to resize ${variant} app icon to ${size}x${size}`,
    )
    yield* runCommand(
      "sips",
      [
        "-z",
        String(size * 2),
        String(size * 2),
        pngPath,
        "--out",
        path.join(iconsetDirectory, `icon_${size}x${size}@2x.png`),
      ],
      `Failed to resize ${variant} app icon to ${size * 2}x${size * 2}`,
    )
  }

  yield* runCommand(
    "iconutil",
    ["-c", "icns", iconsetDirectory, "-o", icnsPath],
    `Failed to build ${variant} icns`,
  )
  yield* fs.remove(iconsetDirectory, { recursive: true, force: true })

  return { variant, svgPath, pngPath, icnsPath, size: APP_ICON_SIZE }
})

const exportAppIcons = Effect.fn("exportAppIcons")(function* () {
  if (process.platform !== "darwin") {
    return yield* new AppIconExportError({
      message: "Exporting app icons requires macOS (sips + iconutil).",
    })
  }

  const variants: ReadonlyArray<AppIconVariant> = ["development", "production"]
  const exported = yield* Effect.forEach(variants, (variant) => exportVariant(variant), {
    concurrency: 1,
  })

  return yield* Effect.sync(() => {
    for (const asset of exported) {
      process.stdout.write(
        `exported ${asset.variant} ${asset.size}x${asset.size} → ${asset.icnsPath}\n`,
      )
    }
  })
})

void scriptRuntime.runPromise(exportAppIcons())
