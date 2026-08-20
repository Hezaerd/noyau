import * as NodeChildProcess from "node:child_process"
import * as NodePath from "node:path"
import * as NodeURL from "node:url"

const desktopDirectory = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "..",
)
const repositoryRoot = NodePath.resolve(desktopDirectory, "../..")

const children = []
let shuttingDown = false

const spawn = (command, arguments_, cwd = repositoryRoot) => {
  const child = NodeChildProcess.spawn(command, arguments_, {
    cwd,
    env: process.env,
    stdio: "inherit",
  })
  children.push(child)
  child.once("exit", (code) => {
    if (!shuttingDown && code !== 0) {
      void shutdown(code ?? 1)
    }
  })
  return child
}

const shutdown = async (exitCode) => {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  for (const child of children) {
    child.kill("SIGTERM")
  }
  process.exit(exitCode)
}

spawn("vp", ["-C", "apps/web", "dev"])

spawn("bun", ["scripts/dev-electron.mjs"], desktopDirectory)

process.once("SIGINT", () => void shutdown(130))
process.once("SIGTERM", () => void shutdown(143))
process.once("SIGHUP", () => void shutdown(129))

await new Promise(() => undefined)
