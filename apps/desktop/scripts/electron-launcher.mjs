// Copies Electron.app so macOS Dock / menu show "Noyau" instead of "Electron".

import * as NodeChildProcess from "node:child_process"
import * as NodeFS from "node:fs"
import * as NodeModule from "node:module"
import * as NodeOS from "node:os"
import * as NodePath from "node:path"
import * as NodeURL from "node:url"

const APP_BASE_NAME = "Noyau"
const PRODUCTION_BUNDLE_ID = "dev.noyau.desktop"
const LAUNCHER_VERSION = 1
const hostPlatform = NodeOS.platform()

export const desktopDir = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "..",
)
const repoRoot = NodePath.resolve(desktopDir, "..", "..")
const devBundleIdSuffix = NodePath.basename(repoRoot)
  .toLowerCase()
  .replaceAll(/[^a-z0-9]+/g, "")

export const resolveAppIdentity = (isDevelopment) => {
  const displayName = isDevelopment ? `${APP_BASE_NAME} (Dev)` : APP_BASE_NAME
  const bundleId = isDevelopment
    ? `${PRODUCTION_BUNDLE_ID}.dev.${devBundleIdSuffix || "local"}`
    : PRODUCTION_BUNDLE_ID
  return { displayName, bundleId }
}

export const resolveMacBundlePaths = (appBundlePath) => ({
  appBundlePath,
  electronBinaryPath: NodePath.join(appBundlePath, "Contents", "MacOS", "Electron"),
  infoPlistPath: NodePath.join(appBundlePath, "Contents", "Info.plist"),
})

export const resolveElectronBinaryPath = (
  createRequire = NodeModule.createRequire,
  moduleUrl = import.meta.url,
) => {
  const require = createRequire(moduleUrl)
  return require("electron")
}

const setPlistString = (plistPath, key, value) => {
  const replaceResult = NodeChildProcess.spawnSync(
    "plutil",
    ["-replace", key, "-string", value, plistPath],
    { encoding: "utf8" },
  )
  if (replaceResult.status === 0) {
    return
  }

  const insertResult = NodeChildProcess.spawnSync(
    "plutil",
    ["-insert", key, "-string", value, plistPath],
    { encoding: "utf8" },
  )
  if (insertResult.status === 0) {
    return
  }

  const details = [replaceResult.stderr, insertResult.stderr].filter(Boolean).join("\n")
  throw new Error(`Failed to update plist key "${key}" at ${plistPath}: ${details}`.trim())
}

const patchMainBundleInfoPlist = (appBundlePath, displayName, bundleId) => {
  const { infoPlistPath } = resolveMacBundlePaths(appBundlePath)
  setPlistString(infoPlistPath, "CFBundleDisplayName", displayName)
  setPlistString(infoPlistPath, "CFBundleName", displayName)
  setPlistString(infoPlistPath, "CFBundleIdentifier", bundleId)
}

const patchHelperBundleInfoPlists = (appBundlePath, displayName, bundleId) => {
  const helperBundles = [
    ["Electron Helper.app", "helper", `${displayName} Helper`],
    ["Electron Helper (GPU).app", "helper.gpu", `${displayName} Helper (GPU)`],
    ["Electron Helper (Plugin).app", "helper.plugin", `${displayName} Helper (Plugin)`],
    ["Electron Helper (Renderer).app", "helper.renderer", `${displayName} Helper (Renderer)`],
  ]

  for (const [bundleName, bundleIdentifierSuffix, bundleDisplayName] of helperBundles) {
    const infoPlistPath = NodePath.join(
      appBundlePath,
      "Contents",
      "Frameworks",
      bundleName,
      "Contents",
      "Info.plist",
    )
    if (!NodeFS.existsSync(infoPlistPath)) {
      continue
    }

    setPlistString(infoPlistPath, "CFBundleDisplayName", bundleDisplayName)
    setPlistString(infoPlistPath, "CFBundleName", bundleDisplayName)
    setPlistString(infoPlistPath, "CFBundleIdentifier", `${bundleId}.${bundleIdentifierSuffix}`)
  }
}

const readJson = (path) => {
  try {
    return JSON.parse(NodeFS.readFileSync(path, "utf8"))
  } catch {
    return null
  }
}

const registerMacLauncherBundle = (appBundlePath) => {
  const result = NodeChildProcess.spawnSync(
    "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
    ["-f", appBundlePath],
    { encoding: "utf8" },
  )
  if (result.status === 0) {
    return
  }

  const details = [result.stdout, result.stderr].filter(Boolean).join("\n")
  process.stderr.write(
    `[desktop-launcher] Failed to register ${appBundlePath} with Launch Services: ${details}\n`,
  )
}

const buildMacLauncher = (electronBinaryPath, isDevelopment) => {
  const { displayName, bundleId } = resolveAppIdentity(isDevelopment)
  const sourceAppBundlePath = NodePath.resolve(NodePath.dirname(electronBinaryPath), "../..")
  const runtimeDir = NodePath.join(desktopDir, ".electron-runtime")
  const targetAppBundlePath = NodePath.join(runtimeDir, `${displayName}.app`)
  const { electronBinaryPath: brandedElectronBinaryPath } =
    resolveMacBundlePaths(targetAppBundlePath)
  const metadataPath = NodePath.join(runtimeDir, `${displayName}.metadata.json`)

  NodeFS.mkdirSync(runtimeDir, { recursive: true })

  const expectedMetadata = {
    launcherVersion: LAUNCHER_VERSION,
    sourceAppBundlePath,
    sourceAppMtimeMs: NodeFS.statSync(sourceAppBundlePath).mtimeMs,
    appBundleId: bundleId,
    displayName,
  }
  const currentMetadata = readJson(metadataPath)
  if (
    NodeFS.existsSync(brandedElectronBinaryPath) &&
    currentMetadata !== null &&
    JSON.stringify(currentMetadata) === JSON.stringify(expectedMetadata)
  ) {
    registerMacLauncherBundle(targetAppBundlePath)
    return brandedElectronBinaryPath
  }

  NodeFS.rmSync(targetAppBundlePath, { recursive: true, force: true })
  // verbatimSymlinks keeps the framework's relative symlinks intact
  // (e.g. Resources -> Versions/Current/Resources). Without it cpSync
  // rewrites them to absolute paths into node_modules, which escape the
  // bundle and crash sandboxed helper processes (icudtl.dat not found).
  NodeFS.cpSync(sourceAppBundlePath, targetAppBundlePath, {
    recursive: true,
    verbatimSymlinks: true,
  })
  patchMainBundleInfoPlist(targetAppBundlePath, displayName, bundleId)
  patchHelperBundleInfoPlists(targetAppBundlePath, displayName, bundleId)
  NodeFS.writeFileSync(metadataPath, `${JSON.stringify(expectedMetadata, null, 2)}\n`)
  registerMacLauncherBundle(targetAppBundlePath)

  return brandedElectronBinaryPath
}

export const resolveElectronPath = (isDevelopment = process.env.NOYAU_DESKTOP_DEV === "1") => {
  const electronBinaryPath = resolveElectronBinaryPath()
  if (hostPlatform !== "darwin") {
    return electronBinaryPath
  }

  return buildMacLauncher(electronBinaryPath, isDevelopment)
}

export const resolveElectronLaunchCommand = (
  args = [],
  isDevelopment = process.env.NOYAU_DESKTOP_DEV === "1",
) => ({
  electronPath: resolveElectronPath(isDevelopment),
  args,
})
