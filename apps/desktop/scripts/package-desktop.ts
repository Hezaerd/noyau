import { Config, Effect, FileSystem, Path, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"

import { desktopDir, resolveAppIdentity } from "./electron-launcher.ts"
import {
  assertHostCanPackage,
  decodeDmgImageFormat,
  dmgImageFormatArgs,
  dmgOutputsToConvert,
  electronBuilderArgs,
  isUlmoDmgFormat,
  PACKAGED_ARTIFACTS,
  PackageDesktopError,
  parsePackageDesktopArgs,
  resolveElectronBuilderCli,
  ulmoConvertArgs,
  ulmoTempDmgPath,
} from "./package-desktop-plan.ts"
import {
  formatPackagedReleaseChannel,
  RELEASE_CHANNEL_ENV,
  resolveReleaseBrand,
} from "./release-version.ts"
import { restoreTty } from "./restore-tty.ts"
import { scriptRuntime } from "./runtime.ts"

const packageError = (message: string) => new PackageDesktopError({ message })

const runCommand = Effect.fn("runPackageCommand")(function* (
  command: string,
  args: ReadonlyArray<string>,
  cwd: string,
) {
  const handle = yield* ChildProcess.make(command, args, {
    cwd,
    extendEnv: true,
    env: { CSC_IDENTITY_AUTO_DISCOVERY: "false" },
    detached: false,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  })
  const code = yield* handle.exitCode.pipe(Effect.orElseSucceed(() => 1))
  if (Number(code) !== 0) {
    return yield* packageError(`${command} ${args.join(" ")} exited with ${String(code)}`)
  }
})

const collectProcessOutput = Effect.fn("collectPackageProcessOutput")(function* (
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

const readDmgImageFormat = Effect.fn("readDmgImageFormat")(function* (dmgPath: string) {
  const result = yield* collectProcessOutput("hdiutil", dmgImageFormatArgs(dmgPath))
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n")
    return yield* packageError(`hdiutil imageinfo failed for ${dmgPath}: ${details}`.trim())
  }
  return yield* decodeDmgImageFormat(result.stdout).pipe(
    Effect.mapError((cause) =>
      packageError(`Unexpected hdiutil image format for ${dmgPath}: ${String(cause)}`),
    ),
  )
})

const formatMegabytes = (bytes: number): string => `${(bytes / 1_048_576).toFixed(1)} MB`

const convertDmgToUlmo = Effect.fn("convertDmgToUlmo")(function* (dmgPath: string) {
  const format = yield* readDmgImageFormat(dmgPath)
  if (isUlmoDmgFormat(format)) {
    return
  }

  const fs = yield* FileSystem.FileSystem
  const before = yield* fs.stat(dmgPath)
  const tempPath = ulmoTempDmgPath(dmgPath)
  yield* fs.remove(tempPath, { force: true })
  yield* runCommand("hdiutil", ulmoConvertArgs(dmgPath, tempPath), desktopDir)

  const convertedFormat = yield* readDmgImageFormat(tempPath)
  if (!isUlmoDmgFormat(convertedFormat)) {
    yield* fs.remove(tempPath, { force: true })
    return yield* packageError(`hdiutil convert did not produce ULMO (${convertedFormat})`)
  }

  yield* fs.remove(dmgPath, { force: true })
  yield* fs.rename(tempPath, dmgPath)
  const after = yield* fs.stat(dmgPath)
  yield* Effect.sync(() => {
    process.stdout.write(
      `DMG ULMO: ${dmgPath} (${formatMegabytes(Number(before.size))} → ${formatMegabytes(Number(after.size))})\n`,
    )
  })
})

const convertPackagedDmgsToUlmo = Effect.fn("convertPackagedDmgsToUlmo")(function* (
  target: "dir" | "dmg" | "nsis",
  outputs: ReadonlyArray<string>,
) {
  const dmgs = dmgOutputsToConvert(target, outputs)
  if (target === "dmg" && dmgs.length === 0) {
    return yield* packageError("electron-builder did not produce a publishable .dmg")
  }
  for (const dmgPath of dmgs) {
    yield* convertDmgToUlmo(dmgPath)
  }
})

const ensurePackagedArtifacts = Effect.fn("ensurePackagedArtifacts")(function* () {
  const path = yield* Path.Path
  const fs = yield* FileSystem.FileSystem
  for (const relativePath of PACKAGED_ARTIFACTS) {
    const artifactPath = path.join(desktopDir, relativePath)
    if (!(yield* fs.exists(artifactPath))) {
      return yield* packageError(`Missing packaged artifact: ${relativePath}`)
    }
  }
})

const isPackagedOutputName = (entry: string): boolean =>
  entry === "Noyau.app" ||
  entry === "Noyau.exe" ||
  entry === "Noyau (Nightly).app" ||
  entry === "Noyau (Nightly).exe" ||
  entry.endsWith(".dmg") ||
  entry.endsWith(".exe")

const findPackagedOutputs = Effect.fn("findPackagedOutputs")(function* () {
  const path = yield* Path.Path
  const fs = yield* FileSystem.FileSystem
  const releaseDirectory = path.join(desktopDir, "release")
  const matches: Array<string> = []
  if (!(yield* fs.exists(releaseDirectory))) {
    return matches
  }
  const topEntries = yield* fs.readDirectory(releaseDirectory)
  for (const entry of topEntries) {
    const entryPath = path.join(releaseDirectory, entry)
    if (isPackagedOutputName(entry)) {
      matches.push(entryPath)
      continue
    }
    const nestedEntries = yield* fs.readDirectory(entryPath).pipe(Effect.orElseSucceed(() => []))
    for (const child of nestedEntries) {
      if (isPackagedOutputName(child)) {
        matches.push(path.join(entryPath, child))
      }
    }
  }
  return matches
})

const packageDesktop = Effect.fn("packageDesktop")(function* () {
  const path = yield* Path.Path
  const args = parsePackageDesktopArgs(process.argv.slice(2), process.platform)
  assertHostCanPackage(args.platform, process.platform)

  const identity = resolveAppIdentity("latest")
  if (identity.bundleId !== "dev.noyau.desktop") {
    return yield* packageError(`Unexpected packaged bundle id: ${identity.bundleId}`)
  }

  const repositoryRoot = path.resolve(desktopDir, "../..")
  if (!args.skipBuild) {
    yield* runCommand("vp", ["run", "--filter", "@noyau/desktop", "build"], repositoryRoot)
  }
  yield* ensurePackagedArtifacts()
  const channel = yield* Config.literals(["latest", "nightly"], RELEASE_CHANNEL_ENV).pipe(
    Config.withDefault("latest"),
  )
  const brand = resolveReleaseBrand(channel)
  const fs = yield* FileSystem.FileSystem
  yield* fs.writeFileString(
    path.join(desktopDir, "dist-electron/release-channel.json"),
    formatPackagedReleaseChannel(channel),
  )
  yield* runCommand(
    process.execPath,
    [
      resolveElectronBuilderCli(),
      ...electronBuilderArgs(args.platform, args.target, args.arch, channel, args.buildVersion),
    ],
    desktopDir,
  )

  const outputs = yield* findPackagedOutputs()
  yield* convertPackagedDmgsToUlmo(args.target, outputs)
  yield* Effect.sync(() => {
    process.stdout.write(
      [
        `Noyau Desktop packaged (unsigned, ${channel}, ${brand.displayName}):`,
        ...outputs.map((output) => `  ${output}`),
        outputs.length === 0 ? "  (see apps/desktop/release/)" : undefined,
        args.platform === "mac"
          ? `  open the .app, or: open "apps/desktop/release/mac*/${brand.displayName}.app"`
          : args.target === "nsis"
            ? "  run the NSIS installer from apps/desktop/release/"
            : `  run ${brand.displayName}.exe from the unpacked directory`,
      ]
        .filter((line) => line !== undefined)
        .join("\n") + "\n",
    )
  })
})

void scriptRuntime.runPromise(Effect.scoped(packageDesktop())).catch((cause: unknown) => {
  restoreTty()
  process.stderr.write(`Failed to package Noyau Desktop: ${String(cause)}\n`)
  process.exit(1)
})
