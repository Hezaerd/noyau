import { Effect, FileSystem, Path, Schema } from "effect"

import { scriptRuntime } from "./runtime.ts"

// artifactName: Noyau-${version}-${os}-${arch}.${ext}
// Top-level only — win-unpacked/Noyau*.exe is the raw Electron binary, not the NSIS installer.
export const PUBLISHABLE_INSTALLER_PATTERN = /^Noyau-.+-(mac|win)-(arm64|x64)\.(dmg|exe)$/

export class CollectReleaseAssetsError extends Schema.TaggedError<CollectReleaseAssetsError>()(
  "CollectReleaseAssetsError",
  { message: Schema.String },
) {}

export interface CollectReleaseAssetsArgs {
  readonly from: string
  readonly to: string
}

const fail = (message: string): never => {
  throw new CollectReleaseAssetsError({ message })
}

export const isPublishableInstallerName = (name: string): boolean =>
  PUBLISHABLE_INSTALLER_PATTERN.test(name)

export const listPublishableInstallerNames = (
  entries: ReadonlyArray<string>,
): ReadonlyArray<string> => entries.filter(isPublishableInstallerName)

export const parseCollectReleaseAssetsArgs = (
  argv: ReadonlyArray<string>,
): CollectReleaseAssetsArgs => {
  const values = new Map<string, string>()
  const unknown: Array<string> = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === undefined) {
      continue
    }
    if (arg === "--from" || arg === "--to") {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith("--")) {
        return fail(`${arg} requires a value`)
      }
      values.set(arg, value)
      index += 1
      continue
    }
    unknown.push(arg)
  }

  if (unknown.length > 0) {
    return fail(`Unknown collect flag(s): ${unknown.join(", ")}`)
  }

  const from = values.get("--from")
  const to = values.get("--to")
  if (from === undefined || from === "") {
    return fail("--from requires a value")
  }
  if (to === undefined || to === "") {
    return fail("--to requires a value")
  }
  return { from, to }
}

export const collectReleaseAssets = Effect.fn("collectReleaseAssets")(function* (
  args: CollectReleaseAssetsArgs,
) {
  const path = yield* Path.Path
  const fs = yield* FileSystem.FileSystem
  if (!(yield* fs.exists(args.from))) {
    return yield* new CollectReleaseAssetsError({
      message: `No installer artifacts found under ${args.from}`,
    })
  }

  const entries = yield* fs.readDirectory(args.from)
  const names = listPublishableInstallerNames(entries)
  if (names.length === 0) {
    return yield* new CollectReleaseAssetsError({
      message: `No installer artifacts found under ${args.from}`,
    })
  }

  yield* fs.makeDirectory(args.to, { recursive: true })
  const copied: Array<string> = []
  for (const name of names) {
    const destination = path.join(args.to, name)
    yield* fs.copyFile(path.join(args.from, name), destination)
    copied.push(destination)
  }
  return copied
})

const isCli = (process.argv[1] ?? "").replaceAll("\\", "/").endsWith("/collect-release-assets.ts")

if (isCli) {
  void scriptRuntime
    .runPromise(
      Effect.gen(function* () {
        const copied = yield* collectReleaseAssets(
          parseCollectReleaseAssetsArgs(process.argv.slice(2)),
        )
        process.stdout.write(copied.map((file) => `${file}\n`).join(""))
      }),
    )
    .catch((cause: unknown) => {
      process.stderr.write(`Failed to collect release assets: ${String(cause)}\n`)
      process.exit(1)
    })
}
