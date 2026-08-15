import * as NodeFSP from "node:fs/promises"
import * as NodeNet from "node:net"
import * as NodePath from "node:path"
import * as NodeTimers from "node:timers/promises"

const fileExists = async (filePath) => {
  try {
    await NodeFSP.access(filePath)
    return true
  } catch {
    return false
  }
}

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

export const waitForResources = async ({
  baseDirectory,
  files,
  host,
  port,
  timeoutMs = 120_000,
}) => {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const filesReady = await Promise.all(
      files.map((file) => fileExists(NodePath.resolve(baseDirectory, file))),
    )
    if (filesReady.every(Boolean) && (await tcpPortIsReady(host, port))) {
      return
    }
    await NodeTimers.setTimeout(100)
  }

  throw new Error(
    `Timed out waiting for desktop resources: ${files.join(", ")}, tcp:${host}:${port}`,
  )
}
