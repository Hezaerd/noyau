import * as NodeChildProcess from "node:child_process"

import { desktopDir, resolveElectronLaunchCommand } from "./electron-launcher.mjs"

const childEnvironment = { ...process.env }
delete childEnvironment.ELECTRON_RUN_AS_NODE

const electronArguments =
  process.platform === "linux"
    ? ["--no-sandbox", "dist-electron/main.cjs"]
    : ["dist-electron/main.cjs"]
const launch = resolveElectronLaunchCommand(electronArguments, false)
const electronProcess = NodeChildProcess.spawn(launch.electronPath, launch.args, {
  cwd: desktopDir,
  env: childEnvironment,
  stdio: "inherit",
})

electronProcess.once("exit", (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
