import * as NodeModule from "node:module"

import { Schema } from "effect"

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

export interface PackageDesktopArgs {
  readonly platform: "mac" | "win"
  readonly target: "dir" | "dmg" | "nsis"
  readonly skipBuild: boolean
}

export const requiredPackagedArtifacts = (): ReadonlyArray<string> => PACKAGED_ARTIFACTS

const fail = (message: string): never => {
  throw new PackageDesktopError({ message })
}

export const parsePackageDesktopArgs = (
  argv: ReadonlyArray<string>,
  hostPlatform: NodeJS.Platform,
): PackageDesktopArgs => {
  const flags = new Set(argv)
  const known = new Set(["--mac", "--win", "--dir", "--dmg", "--nsis", "--skip-build"])
  const unknown = argv.filter((flag) => !known.has(flag))
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

  return { platform, target, skipBuild: flags.has("--skip-build") }
}

export const electronBuilderArgs = (
  platform: PackageDesktopArgs["platform"],
  target: PackageDesktopArgs["target"],
): ReadonlyArray<string> => [platform === "mac" ? "--mac" : "--win", target, "--publish", "never"]

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
