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
let shutdownEndpointRequestedAt
electronProcess.stdout.on("data", (chunk) => {
  const text = chunk.toString()
  output += text
  if (
    shutdownEndpointRequestedAt === undefined &&
    text.includes("NOYAU_DESKTOP_SHUTDOWN_ENDPOINT_REQUESTED")
  ) {
    shutdownEndpointRequestedAt = performance.now()
  }
})
electronProcess.stderr.on("data", (chunk) => {
  output += chunk.toString()
})

const timeout = setTimeout(() => {
  electronProcess.kill("SIGTERM")
}, 15_000)

electronProcess.once("exit", (code) => {
  clearTimeout(timeout)
  const shutdownDuration =
    shutdownEndpointRequestedAt === undefined
      ? undefined
      : Math.round(performance.now() - shutdownEndpointRequestedAt)
  if (
    code === 0 &&
    output.includes("NOYAU_DESKTOP_SMOKE_TEST_OK") &&
    shutdownDuration !== undefined &&
    shutdownDuration < 2_000
  ) {
    process.stdout.write(
      `Noyau Desktop smoke test passed (${shutdownDuration}ms after endpoint).\n`,
    )
    process.exit(0)
  }

  process.stderr.write(`Noyau Desktop smoke test failed (exit ${String(code)}).\n${output}`)
  process.exit(1)
})
