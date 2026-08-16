import * as NodeChildProcess from "node:child_process"

import { desktopDir, resolveElectronLaunchCommand } from "./electron-launcher.mjs"

const electronArguments = ["dist-electron/main.cjs"]
const launch = resolveElectronLaunchCommand(electronArguments, false)
const command = process.platform === "linux" ? "xvfb-run" : launch.electronPath
const commandArguments =
  process.platform === "linux"
    ? ["-a", launch.electronPath, "--no-sandbox", ...electronArguments]
    : launch.args
const childEnvironment = {
  ...process.env,
  NOYAU_DESKTOP_SMOKE_TEST: "1",
}
delete childEnvironment.ELECTRON_RUN_AS_NODE

const electronProcess = NodeChildProcess.spawn(command, commandArguments, {
  cwd: desktopDir,
  env: childEnvironment,
  stdio: ["ignore", "pipe", "pipe"],
})

let output = ""
electronProcess.stdout.on("data", (chunk) => {
  output += chunk.toString()
})
electronProcess.stderr.on("data", (chunk) => {
  output += chunk.toString()
})

const timeout = setTimeout(() => {
  electronProcess.kill("SIGTERM")
}, 15_000)

electronProcess.once("exit", (code) => {
  clearTimeout(timeout)
  if (code === 0 && output.includes("NOYAU_DESKTOP_SMOKE_TEST_OK")) {
    process.stdout.write("Noyau Desktop smoke test passed.\n")
    process.exit(0)
  }

  process.stderr.write(`Noyau Desktop smoke test failed (exit ${String(code)}).\n${output}`)
  process.exit(1)
})
