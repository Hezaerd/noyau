// Copies Electron.app so macOS Dock / menu show "Noyau" instead of "Electron".

import * as NodeModule from "node:module"
import * as NodeOS from "node:os"
import { fileURLToPath } from "node:url"

import { Config, Effect, FileSystem, Option, Schema, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

import {
  MAC_BUNDLE_ICON_FILE,
  resolveAppIconPath,
  resolveMacBundleIconPath,
  resolveMacBundleStockIconPath,
} from "./app-icon.ts"
import {
  RELEASE_CHANNEL_ENV,
  resolveReleaseBrand,
  type DesktopReleaseChannel,
} from "./release-version.ts"

const PRODUCTION_BUNDLE_ID = "dev.noyau.desktop"
const LAUNCHER_VERSION = 3
const hostPlatform = NodeOS.platform()

class LauncherError extends Schema.TaggedError<LauncherError>()("LauncherError", {
  message: Schema.String,
}) {}

const LauncherMetadata = Schema.Struct({
  launcherVersion: Schema.Finite,
  sourceAppBundlePath: Schema.String,
  sourceAppMtimeMs: Schema.Finite,
  appBundleId: Schema.String,
  displayName: Schema.String,
  appIconPath: Schema.String,
  appIconMtimeMs: Schema.Finite,
})
const decodeLauncherMetadata = Schema.decodeUnknownEffect(Schema.fromJsonString(LauncherMetadata))
const encodeLauncherMetadata = Schema.encodeEffect(Schema.fromJsonString(LauncherMetadata))

export const desktopDir = fileURLToPath(new URL("..", import.meta.url))
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url))
const devBundleIdSuffix = (repoRoot.split("/").pop() ?? "")
  .toLowerCase()
  .replaceAll(/[^a-z0-9]+/g, "")

export const resolveAppIdentity = (channel: DesktopReleaseChannel) => {
  if (channel === "development") {
    return {
      displayName: "Noyau (Dev)",
      bundleId: `${PRODUCTION_BUNDLE_ID}.dev.${devBundleIdSuffix || "local"}`,
    }
  }
  const brand = resolveReleaseBrand(channel)
  return { displayName: brand.displayName, bundleId: brand.bundleId }
}

export const resolveMacBundlePaths = (appBundlePath: string) => ({
  appBundlePath,
  electronBinaryPath: `${appBundlePath}/Contents/MacOS/Electron`,
  infoPlistPath: `${appBundlePath}/Contents/Info.plist`,
})

export const resolveElectronBinaryPath = (
  createRequire: (url: string) => (specifier: string) => string = NodeModule.createRequire,
  moduleUrl: string = import.meta.url,
) => {
  const require = createRequire(moduleUrl)
  return require("electron")
}

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

const setPlistString = Effect.fn("setPlistString")(function* (
  plistPath: string,
  key: string,
  value: string,
) {
  const replaceResult = yield* collectProcessOutput("plutil", [
    "-replace",
    key,
    "-string",
    value,
    plistPath,
  ])
  if (replaceResult.status === 0) {
    return
  }

  const insertResult = yield* collectProcessOutput("plutil", [
    "-insert",
    key,
    "-string",
    value,
    plistPath,
  ])
  if (insertResult.status === 0) {
    return
  }

  const details = [replaceResult.stderr, insertResult.stderr].filter(Boolean).join("\n")
  return yield* new LauncherError({
    message: `Failed to update plist key "${key}" at ${plistPath}: ${details}`.trim(),
  })
})

const deletePlistKey = Effect.fn("deletePlistKey")(function* (plistPath: string, key: string) {
  yield* collectProcessOutput("plutil", ["-remove", key, plistPath])
})

const patchMainBundleInfoPlist = Effect.fn("patchMainBundleInfoPlist")(function* (
  appBundlePath: string,
  displayName: string,
  bundleId: string,
) {
  const { infoPlistPath } = resolveMacBundlePaths(appBundlePath)
  yield* setPlistString(infoPlistPath, "CFBundleDisplayName", displayName)
  yield* setPlistString(infoPlistPath, "CFBundleName", displayName)
  yield* setPlistString(infoPlistPath, "CFBundleIdentifier", bundleId)
  yield* setPlistString(infoPlistPath, "CFBundleIconFile", MAC_BUNDLE_ICON_FILE)
  yield* deletePlistKey(infoPlistPath, "CFBundleIconName")
})

const patchHelperBundleInfoPlists = Effect.fn("patchHelperBundleInfoPlists")(function* (
  appBundlePath: string,
  displayName: string,
  bundleId: string,
) {
  const fs = yield* FileSystem.FileSystem
  const helperBundles = [
    ["Electron Helper.app", "helper", `${displayName} Helper`],
    ["Electron Helper (GPU).app", "helper.gpu", `${displayName} Helper (GPU)`],
    ["Electron Helper (Plugin).app", "helper.plugin", `${displayName} Helper (Plugin)`],
    ["Electron Helper (Renderer).app", "helper.renderer", `${displayName} Helper (Renderer)`],
  ] as const

  for (const [bundleName, bundleIdentifierSuffix, bundleDisplayName] of helperBundles) {
    const infoPlistPath = `${appBundlePath}/Contents/Frameworks/${bundleName}/Contents/Info.plist`
    if (!(yield* fs.exists(infoPlistPath))) {
      continue
    }

    yield* setPlistString(infoPlistPath, "CFBundleDisplayName", bundleDisplayName)
    yield* setPlistString(infoPlistPath, "CFBundleName", bundleDisplayName)
    yield* setPlistString(
      infoPlistPath,
      "CFBundleIdentifier",
      `${bundleId}.${bundleIdentifierSuffix}`,
    )
  }
})

const readJson = Effect.fn("readJson")(function* (filePath: string) {
  const fs = yield* FileSystem.FileSystem
  return yield* fs
    .readFileString(filePath)
    .pipe(Effect.flatMap(decodeLauncherMetadata), Effect.option)
})

const registerMacLauncherBundle = Effect.fn("registerMacLauncherBundle")(function* (
  appBundlePath: string,
) {
  const result = yield* collectProcessOutput(
    "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
    ["-f", appBundlePath],
  )
  if (result.status === 0) {
    return
  }

  const details = [result.stdout, result.stderr].filter(Boolean).join("\n")
  yield* Effect.sync(() => {
    process.stderr.write(
      `[desktop-launcher] Failed to register ${appBundlePath} with Launch Services: ${details}\n`,
    )
  })
})

const copyAppBundle = Effect.fn("copyAppBundle")(function* (
  sourceAppBundlePath: string,
  targetAppBundlePath: string,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const code = yield* spawner.exitCode(
    ChildProcess.make("cp", ["-a", sourceAppBundlePath, targetAppBundlePath]),
  )
  if (Number(code) !== 0) {
    return yield* new LauncherError({
      message: `Failed to copy Electron.app from ${sourceAppBundlePath} to ${targetAppBundlePath}`,
    })
  }
})

const fileMtimeMs = Effect.fn("fileMtimeMs")(function* (filePath: string) {
  const fs = yield* FileSystem.FileSystem
  const stat = yield* fs.stat(filePath)
  return Option.match(stat.mtime, {
    onNone: () => 0,
    onSome: (mtime) => mtime.getTime(),
  })
})

const installAppIcon = Effect.fn("installAppIcon")(function* (
  appBundlePath: string,
  iconPath: string,
) {
  const fs = yield* FileSystem.FileSystem
  if (!(yield* fs.exists(iconPath))) {
    return yield* new LauncherError({
      message: `Missing app icon at ${iconPath}. Run bun run export-app-icon from apps/desktop.`,
    })
  }

  for (const targetIconPath of [
    resolveMacBundleIconPath(appBundlePath),
    resolveMacBundleStockIconPath(appBundlePath),
  ]) {
    if (yield* fs.exists(targetIconPath)) {
      yield* fs.remove(targetIconPath)
    }
    yield* fs.copyFile(iconPath, targetIconPath)
  }
})

const buildMacLauncher = Effect.fn("buildMacLauncher")(function* (
  electronBinaryPath: string,
  channel: DesktopReleaseChannel,
) {
  const fs = yield* FileSystem.FileSystem
  const { displayName, bundleId } = resolveAppIdentity(channel)
  const sourceAppBundlePath = electronBinaryPath.split("/").slice(0, -3).join("/")
  const runtimeDir = `${desktopDir}/.electron-runtime`
  const targetAppBundlePath = `${runtimeDir}/${displayName}.app`
  const { electronBinaryPath: brandedElectronBinaryPath } =
    resolveMacBundlePaths(targetAppBundlePath)
  const metadataPath = `${runtimeDir}/${displayName}.metadata.json`

  yield* fs.makeDirectory(runtimeDir, { recursive: true })

  const appIconPath = resolveAppIconPath(desktopDir, channel)
  if (!(yield* fs.exists(appIconPath))) {
    return yield* new LauncherError({
      message: `Missing app icon at ${appIconPath}. Run bun run export-app-icon from apps/desktop.`,
    })
  }
  const sourceAppMtimeMs = yield* fileMtimeMs(sourceAppBundlePath)
  const appIconMtimeMs = yield* fileMtimeMs(appIconPath)
  const expectedMetadata = {
    launcherVersion: LAUNCHER_VERSION,
    sourceAppBundlePath,
    sourceAppMtimeMs,
    appBundleId: bundleId,
    displayName,
    appIconPath,
    appIconMtimeMs,
  }
  const currentMetadata = yield* readJson(metadataPath)
  const currentEncoded = Option.isSome(currentMetadata)
    ? yield* encodeLauncherMetadata(currentMetadata.value)
    : undefined
  const expectedEncoded = yield* encodeLauncherMetadata(expectedMetadata)
  if (
    (yield* fs.exists(brandedElectronBinaryPath)) &&
    currentEncoded !== undefined &&
    currentEncoded === expectedEncoded
  ) {
    yield* registerMacLauncherBundle(targetAppBundlePath)
    return brandedElectronBinaryPath
  }

  yield* fs.remove(targetAppBundlePath, { recursive: true, force: true })
  yield* copyAppBundle(sourceAppBundlePath, targetAppBundlePath)
  yield* patchMainBundleInfoPlist(targetAppBundlePath, displayName, bundleId)
  yield* patchHelperBundleInfoPlists(targetAppBundlePath, displayName, bundleId)
  yield* installAppIcon(targetAppBundlePath, appIconPath)
  yield* fs.writeFileString(metadataPath, `${yield* encodeLauncherMetadata(expectedMetadata)}\n`)
  yield* registerMacLauncherBundle(targetAppBundlePath)

  return brandedElectronBinaryPath
})

const launchChannel = Effect.fn("launchChannel")(function* (
  channel: DesktopReleaseChannel | undefined,
) {
  if (channel !== undefined) {
    return channel
  }
  const raw = yield* Config.option(Config.string(RELEASE_CHANNEL_ENV))
  const channelFromEnv = Option.getOrUndefined(raw)
  if (
    channelFromEnv === "development" ||
    channelFromEnv === "latest" ||
    channelFromEnv === "nightly"
  ) {
    return channelFromEnv
  }
  return "latest"
})

export const resolveElectronPath = Effect.fn("resolveElectronPath")(function* (
  channel?: DesktopReleaseChannel,
) {
  const resolvedChannel = yield* launchChannel(channel)
  const electronBinaryPath = resolveElectronBinaryPath()
  if (hostPlatform !== "darwin") {
    return electronBinaryPath
  }

  return yield* buildMacLauncher(electronBinaryPath, resolvedChannel)
})

export const resolveElectronLaunchCommand = Effect.fn("resolveElectronLaunchCommand")(function* (
  args: ReadonlyArray<string> = [],
  channel?: DesktopReleaseChannel,
) {
  return {
    electronPath: yield* resolveElectronPath(channel),
    args,
  }
})
