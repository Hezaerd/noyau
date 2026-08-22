import { Effect, FileSystem, Path } from "effect"
import { ChildProcess } from "effect/unstable/process"

import { desktopDir, resolveAppIdentity } from "./electron-launcher.ts"
import {
  assertHostCanPackage,
  electronBuilderArgs,
  PACKAGED_ARTIFACTS,
  PackageDesktopError,
  parsePackageDesktopArgs,
  resolveElectronBuilderCli,
} from "./package-desktop-plan.ts"
import {
  formatPackagedReleaseChannel,
  releaseChannelFromVersion,
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
  const channel = releaseChannelFromVersion(args.buildVersion)
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
      ...electronBuilderArgs(args.platform, args.target, args.arch, args.buildVersion),
    ],
    desktopDir,
  )

  const outputs = yield* findPackagedOutputs()
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
