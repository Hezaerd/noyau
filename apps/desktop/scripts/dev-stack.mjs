import * as NodeChildProcess from "node:child_process"
import * as NodeNet from "node:net"
import * as NodePath from "node:path"
import * as NodeURL from "node:url"

const desktopDirectory = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "..",
)
const repositoryRoot = NodePath.resolve(desktopDirectory, "../..")

const tcpPortIsReady = (host, port) =>
  new Promise((resolve) => {
    const socket = NodeNet.createConnection({ host, port })
    const finish = (ready) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(ready)
    }

    socket.once("connect", () => finish(true))
    socket.once("error", () => finish(false))
    socket.setTimeout(500, () => finish(false))
  })

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

if (await tcpPortIsReady("127.0.0.1", 3001)) {
  process.stdout.write("Reusing Noyau Server on 127.0.0.1:3001.\n")
} else {
  spawn("bun", ["run", "--cwd", "apps/server", "dev"])
}

if (await tcpPortIsReady("127.0.0.1", 5173)) {
  process.stdout.write("Reusing Vite on 127.0.0.1:5173.\n")
} else {
  spawn("vp", ["-C", "apps/web", "dev"])
}

spawn("bun", ["scripts/dev-electron.mjs"], desktopDirectory)

process.once("SIGINT", () => void shutdown(130))
process.once("SIGTERM", () => void shutdown(143))
process.once("SIGHUP", () => void shutdown(129))

await new Promise(() => undefined)
