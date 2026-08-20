import * as NodeChildProcess from "node:child_process"
import * as NodeCrypto from "node:crypto"
import * as NodeFS from "node:fs"
import * as NodePath from "node:path"

import { desktopDir, resolveElectronLaunchCommand } from "./electron-launcher.mjs"
import { waitForResources } from "./wait-for-resources.mjs"

const repositoryRoot = NodePath.resolve(desktopDir, "../..")
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

const dataDirectory = NodePath.join(repositoryRoot, ".noyau-dev")
NodeFS.mkdirSync(dataDirectory, { recursive: true })

const bootstrap = {
  dataDirectory,
  host: "127.0.0.1",
  port: 3001,
  bearerToken: NodeCrypto.randomBytes(32).toString("hex"),
  actorId: "human:local",
  environmentId: "00000000-0000-4000-8000-000000000001",
  environmentCreatedAt: new Date().toISOString(),
  bootstrapVersion: "1",
  bundleVersion: "0.1.0-dev",
  serverVersion: "0.1.0-dev",
}

let serverProcess
let electronProcess
let restartTimer
let shuttingDown = false

const startServer = () => {
  serverProcess = NodeChildProcess.spawn(
    "bun",
    ["--watch", "apps/server/src/main.ts", "--bootstrap-fd", "3"],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        NOYAU_BOOTSTRAP_FD: "3",
      },
      stdio: ["ignore", "inherit", "inherit", "pipe"],
    },
  )
  serverProcess.stdio[3].end(`${JSON.stringify(bootstrap)}\n`)
}

const startElectron = () => {
  if (shuttingDown || electronProcess !== undefined) {
    return
  }

  const launch = resolveElectronLaunchCommand(electronArguments, true)
  electronProcess = NodeChildProcess.spawn(launch.electronPath, launch.args, {
    cwd: desktopDir,
    env: {
      ...childEnvironment,
      NOYAU_DESKTOP_EXTERNAL_SERVER: "1",
    },
    stdio: ["ignore", "inherit", "inherit", "pipe"],
  })
  electronProcess.stdio[3].end(`${JSON.stringify(bootstrap)}\n`)
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

const shutdown = async (exitCode) => {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  if (restartTimer !== undefined) {
    clearTimeout(restartTimer)
  }
  await stopChild(electronProcess)
  try {
    await fetch(`http://${bootstrap.host}:${bootstrap.port}/internal/shutdown`, {
      method: "POST",
      headers: { authorization: `Bearer ${bootstrap.bearerToken}` },
      signal: AbortSignal.timeout(500),
    })
  } catch {
    await stopChild(serverProcess)
  }
  process.exit(exitCode)
}

await waitForResources({
  baseDirectory: desktopDir,
  files: ["dist-electron/main.cjs", "dist-electron/preload.cjs"],
  host: "127.0.0.1",
  port: 5173,
})
startServer()
startElectron()

NodeFS.watch(bundleDirectory, (_eventType, filename) => {
  if (filename !== null && watchedBundles.has(filename)) {
    if (restartTimer !== undefined) {
      clearTimeout(restartTimer)
    }
    restartTimer = setTimeout(() => {
      restartTimer = undefined
      void stopChild(electronProcess).then(startElectron)
    }, 150)
  }
})

process.once("SIGINT", () => void shutdown(130))
process.once("SIGTERM", () => void shutdown(143))
process.once("SIGHUP", () => void shutdown(129))
