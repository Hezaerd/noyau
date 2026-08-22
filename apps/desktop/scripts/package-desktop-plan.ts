import * as NodeModule from "node:module"

import { Schema } from "effect"

import { resolveReleaseBrand, type ReleaseChannel } from "./release-version.ts"

export const PACKAGED_ARTIFACTS = [
  "dist-electron/main.cjs",
  "dist-electron/preload.cjs",
  "dist-electron/renderer/index.html",
  "dist-electron/server/main.mjs",
] as const

export class PackageDesktopError extends Schema.TaggedError<PackageDesktopError>()(
  "PackageDesktopError",
  { message: Schema.String },
) {}

export type PackageDesktopArch = "arm64" | "x64"

export interface PackageDesktopArgs {
  readonly platform: "mac" | "win"
  readonly target: "dir" | "dmg" | "nsis"
  readonly arch: PackageDesktopArch | undefined
  readonly buildVersion: string | undefined
  readonly skipBuild: boolean
}

export const requiredPackagedArtifacts = (): ReadonlyArray<string> => PACKAGED_ARTIFACTS

const BOOLEAN_FLAGS = new Set(["--mac", "--win", "--dir", "--dmg", "--nsis", "--skip-build"])
const VALUE_FLAGS = new Set(["--arch", "--build-version"])
const RELEASE_VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$/

const fail = (message: string): never => {
  throw new PackageDesktopError({ message })
}

const readFlagValue = (argv: ReadonlyArray<string>, index: number, flag: string) => {
  const value = argv[index + 1]
  if (value === undefined || value.startsWith("--")) {
    return fail(`${flag} requires a value`)
  }
  return { value, nextIndex: index + 1 }
}

export const parsePackageDesktopArgs = (
  argv: ReadonlyArray<string>,
  hostPlatform: NodeJS.Platform,
): PackageDesktopArgs => {
  const flags = new Set<string>()
  const values = new Map<string, string>()
  const unknown: Array<string> = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === undefined) {
      continue
    }
    if (VALUE_FLAGS.has(arg)) {
      const parsed = readFlagValue(argv, index, arg)
      values.set(arg, parsed.value)
      index = parsed.nextIndex
      continue
    }
    if (BOOLEAN_FLAGS.has(arg)) {
      flags.add(arg)
      continue
    }
    unknown.push(arg)
  }

  if (unknown.length > 0) {
    return fail(`Unknown packaging flag(s): ${unknown.join(", ")}`)
  }
  if (flags.has("--mac") && flags.has("--win")) {
    return fail("Choose either --mac or --win")
  }
  const targetFlags = [flags.has("--dir"), flags.has("--dmg"), flags.has("--nsis")].filter(Boolean)
  if (targetFlags.length > 1) {
    return fail("Choose a single target: --dir, --dmg, or --nsis")
  }

  const platform = flags.has("--win")
    ? "win"
    : flags.has("--mac")
      ? "mac"
      : hostPlatform === "darwin"
        ? "mac"
        : hostPlatform === "win32"
          ? "win"
          : undefined
  if (platform === undefined) {
    return fail("Package macOS from a Mac or Windows from a Windows machine")
  }

  const target = flags.has("--dmg") ? "dmg" : flags.has("--nsis") ? "nsis" : "dir"
  if (platform === "mac" && target === "nsis") {
    return fail("--nsis is a Windows target")
  }
  if (platform === "win" && target === "dmg") {
    return fail("--dmg is a macOS target")
  }

  const rawArch = values.get("--arch")
  if (rawArch !== undefined && rawArch !== "arm64" && rawArch !== "x64") {
    return fail("--arch must be arm64 or x64")
  }

  const buildVersion = values.get("--build-version")
  if (buildVersion !== undefined && !RELEASE_VERSION_PATTERN.test(buildVersion)) {
    return fail(`Invalid --build-version: ${buildVersion}`)
  }

  return {
    platform,
    target,
    arch: rawArch,
    buildVersion,
    skipBuild: flags.has("--skip-build"),
  }
}

export const electronBuilderArgs = (
  platform: PackageDesktopArgs["platform"],
  target: PackageDesktopArgs["target"],
  arch: PackageDesktopArgs["arch"],
  channel: ReleaseChannel,
  buildVersion: PackageDesktopArgs["buildVersion"],
): ReadonlyArray<string> => {
  const brand = resolveReleaseBrand(channel)
  const args = [platform === "mac" ? "--mac" : "--win", target]
  if (arch !== undefined) {
    args.push(`--${arch}`)
  }
  args.push("--publish", "never", `-c.extraMetadata.noyauReleaseChannel=${channel}`)
  if (buildVersion !== undefined) {
    args.push(`-c.extraMetadata.version=${buildVersion}`)
  }
  if (channel === "nightly") {
    args.push(
      `-c.productName=${brand.displayName}`,
      `-c.extraMetadata.productName=${brand.displayName}`,
      `-c.appId=${brand.bundleId}`,
      `-c.mac.icon=${brand.macIcon}`,
      `-c.win.icon=${brand.winIcon}`,
    )
  }
  return args
}

export const resolveElectronBuilderCli = (
  createRequire: (url: string) => NodeJS.Require = NodeModule.createRequire,
  moduleUrl: string = import.meta.url,
): string => createRequire(moduleUrl).resolve("electron-builder/cli.js")

export const assertHostCanPackage = (
  platform: PackageDesktopArgs["platform"],
  hostPlatform: NodeJS.Platform,
): void => {
  if (platform === "mac" && hostPlatform !== "darwin") {
    fail("Package macOS from a Mac. Cross-compilation is out of scope.")
  }
  if (platform === "win" && hostPlatform !== "win32") {
    fail("Package Windows from a Windows machine. Same extraResources layout; see README.")
  }
}
