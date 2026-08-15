import * as NodeChildProcess from "node:child_process"
import * as NodeFS from "node:fs"
import * as NodePath from "node:path"

import { desktopDir, resolveElectronLaunchCommand } from "./electron-launcher.mjs"
import { waitForResources } from "./wait-for-resources.mjs"

const bundleDirectory = NodePath.join(desktopDir, "dist-electron")
const watchedBundles = new Set(["main.cjs", "preload.cjs"])
const childEnvironment = {
  ...process.env,
  NOYAU_DESKTOP_DEV: "1",
}
delete childEnvironment.ELECTRON_RUN_AS_NODE

const electronArguments =
  process.platform === "linux"
    ? ["--no-sandbox", "dist-electron/main.cjs"]
    : ["dist-electron/main.cjs"]

let electronProcess
let restartTimer
let shuttingDown = false

const packProcess = NodeChildProcess.spawn("vp", ["pack", "--watch"], {
  cwd: desktopDir,
  env: process.env,
  stdio: "inherit",
})

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
  electronProcess.once("exit", () => {
    electronProcess = undefined
  })
}

const stopElectron = async () => {
  const child = electronProcess
  if (child === undefined) {
    return
  }
  electronProcess = undefined

  await new Promise((resolve) => {
    child.once("exit", resolve)
    child.kill("SIGTERM")
    setTimeout(resolve, 1_500).unref()
  })
}

const restartElectron = () => {
  if (restartTimer !== undefined) {
    clearTimeout(restartTimer)
  }
  restartTimer = setTimeout(() => {
    restartTimer = undefined
    void stopElectron().then(startElectron)
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
  await stopElectron()
  packProcess.kill("SIGTERM")
  process.exit(exitCode)
}

packProcess.once("exit", (code) => {
  if (!shuttingDown && code !== 0) {
    void shutdown(code ?? 1)
  }
})

await waitForResources({
  baseDirectory: desktopDir,
  files: ["dist-electron/main.cjs", "dist-electron/preload.cjs"],
  host: "127.0.0.1",
  port: 5173,
})

NodeFS.watch(bundleDirectory, (_eventType, filename) => {
  if (filename !== null && watchedBundles.has(filename)) {
    restartElectron()
  }
})
startElectron()

process.once("SIGINT", () => void shutdown(130))
process.once("SIGTERM", () => void shutdown(143))
process.once("SIGHUP", () => void shutdown(129))
