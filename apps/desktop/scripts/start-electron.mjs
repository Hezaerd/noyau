import * as NodeChildProcess from "node:child_process"
import * as NodeModule from "node:module"
import * as NodePath from "node:path"
import * as NodeURL from "node:url"

const require = NodeModule.createRequire(import.meta.url)
const electronPath = require("electron")
const desktopDirectory = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "..",
)
const childEnvironment = { ...process.env }
delete childEnvironment.ELECTRON_RUN_AS_NODE

const electronArguments =
  process.platform === "linux"
    ? ["--no-sandbox", "dist-electron/main.cjs"]
    : ["dist-electron/main.cjs"]
const electronProcess = NodeChildProcess.spawn(electronPath, electronArguments, {
  cwd: desktopDirectory,
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
