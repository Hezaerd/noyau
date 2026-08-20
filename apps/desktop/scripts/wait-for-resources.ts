import { createConnection } from "node:net"

import { Clock, Effect, FileSystem, Path, Schema } from "effect"

class ResourceTimeout extends Schema.TaggedError<ResourceTimeout>()("ResourceTimeout", {
  message: Schema.String,
}) {}

const fileExists = Effect.fn("fileExists")(function* (filePath: string) {
  const fs = yield* FileSystem.FileSystem
  return yield* fs.exists(filePath)
})

const tcpPortIsReady = (host: string, port: number) =>
  Effect.callback<boolean>((resume) => {
    const socket = createConnection({ host, port })
    const finish = (ready: boolean) => {
      socket.removeAllListeners()
      socket.destroy()
      resume(Effect.succeed(ready))
    }

    socket.once("connect", () => finish(true))
    socket.once("error", () => finish(false))
    return Effect.sync(() => {
      socket.removeAllListeners()
      socket.destroy()
    })
  }).pipe(Effect.timeoutOrElse({ duration: 500, orElse: () => Effect.succeed(false) }))

export const waitForResources = Effect.fn("waitForResources")(function* (options: {
  readonly baseDirectory: string
  readonly files: ReadonlyArray<string>
  readonly host: string
  readonly port: number
  readonly timeoutMs?: number
}) {
  const path = yield* Path.Path
  const timeoutMs = options.timeoutMs ?? 120_000
  const startedAt = yield* Clock.currentTimeMillis

  while (true) {
    const filesReady = yield* Effect.all(
      options.files.map((file) => fileExists(path.resolve(options.baseDirectory, file))),
    )
    const portReady = yield* tcpPortIsReady(options.host, options.port)
    if (filesReady.every(Boolean) && portReady) {
      return
    }

    const now = yield* Clock.currentTimeMillis
    if (now - startedAt >= timeoutMs) {
      return yield* new ResourceTimeout({
        message: `Timed out waiting for desktop resources: ${options.files.join(", ")}, tcp:${options.host}:${options.port}`,
      })
    }

    yield* Effect.sleep(100)
  }
})
