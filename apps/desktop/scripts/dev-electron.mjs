import * as NodeChildProcess from "node:child_process"
import * as NodeFS from "node:fs"
import * as NodePath from "node:path"

import { desktopDir, resolveElectronLaunchCommand } from "./electron-launcher.mjs"
import { waitForResources } from "./wait-for-resources.mjs"

const repositoryRoot = NodePath.resolve(desktopDir, "../..")
const bundleDirectory = NodePath.join(desktopDir, "dist-electron")
const serverBundleDirectory = NodePath.join(repositoryRoot, "apps/server/dist")
const serverEntry = NodePath.join(serverBundleDirectory, "main.mjs")
const watchedDesktopBundles = new Set(["main.cjs", "preload.cjs"])
const watchedServerBundles = new Set(["main.mjs"])
const childEnvironment = {
  ...process.env,
  NOYAU_DESKTOP_DEV: "1",
  NOYAU_SERVER_ENTRY: serverEntry,
}
delete childEnvironment.ELECTRON_RUN_AS_NODE

const electronArguments =
  process.platform === "linux"
    ? ["--no-sandbox", "dist-electron/main.cjs"]
    : ["dist-electron/main.cjs"]

let electronProcess
let restartTimer
let shuttingDown = false

const startElectron = () => {
  if (shuttingDown || electronProcess !== undefined) {
    return
  }

  const launch = resolveElectronLaunchCommand(electronArguments, true)
  electronProcess = NodeChildProcess.spawn(launch.electronPath, launch.args, {
    cwd: desktopDir,
    env: childEnvironment,
    stdio: "inherit",
  })
  electronProcess.once("exit", (code) => {
    electronProcess = undefined
    if (!shuttingDown && code !== 0) {
      process.exitCode = code ?? 1
    }
  })
}

const stopChild = async (child) => {
  if (child === undefined) {
    return
  }
  await new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve()
      return
    }
    child.once("exit", resolve)
    child.kill()
    setTimeout(resolve, 2_000).unref()
  })
}

const scheduleRestart = () => {
  if (restartTimer !== undefined) {
    clearTimeout(restartTimer)
  }
  restartTimer = setTimeout(() => {
    restartTimer = undefined
    void stopChild(electronProcess).then(startElectron)
  }, 150)
}

const shutdown = async (exitCode) => {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  if (restartTimer !== undefined) {
    clearTimeout(restartTimer)
  }
  await stopChild(electronProcess)
  process.exit(exitCode)
}

await waitForResources({
  baseDirectory: desktopDir,
  files: ["dist-electron/main.cjs", "dist-electron/preload.cjs", "../server/dist/main.mjs"],
  host: "127.0.0.1",
  port: 5173,
})
startElectron()

const watchBundleDirectory = (directory, watchedFiles) => {
  NodeFS.watch(directory, (_eventType, filename) => {
    if (filename !== null && watchedFiles.has(filename)) {
      scheduleRestart()
    }
  })
}

watchBundleDirectory(bundleDirectory, watchedDesktopBundles)
watchBundleDirectory(serverBundleDirectory, watchedServerBundles)

process.once("SIGINT", () => void shutdown(130))
process.once("SIGTERM", () => void shutdown(143))
process.once("SIGHUP", () => void shutdown(129))
