import { createRequire } from "node:module"

import { TerminalSpawnError } from "@noyau/contracts/terminal"
import { Effect, FileSystem, Layer, Path } from "effect"

import {
  PtyAdapter,
  type PtyExitEvent,
  type PtyProcess,
  type PtySpawnInput,
} from "./pty-adapter.ts"

type NodePtyModule = typeof import("node-pty")

const requireForNodePty = createRequire(import.meta.url)

class NodePtyProcess implements PtyProcess {
  constructor(private readonly process: import("node-pty").IPty) {}

  get pid(): number {
    return this.process.pid
  }

  write(data: string): void {
    this.process.write(data)
  }

  resize(cols: number, rows: number): void {
    this.process.resize(cols, rows)
  }

  kill(signal?: string): void {
    this.process.kill(signal)
  }

  onData(callback: (data: string) => void): () => void {
    const disposable = this.process.onData(callback)
    return () => {
      disposable.dispose()
    }
  }

  onExit(callback: (event: PtyExitEvent) => void): () => void {
    const disposable = this.process.onExit((event) => {
      callback({
        exitCode: event.exitCode,
        signal: event.signal ?? null,
      })
    })
    return () => {
      disposable.dispose()
    }
  }
}

const chmodSpawnHelper = Effect.fn("NodePtyAdapter.chmodSpawnHelper")(function* () {
  if (process.platform === "win32") {
    return
  }
  const path = yield* Path.Path
  const fileSystem = yield* FileSystem.FileSystem
  const packageJsonPath = requireForNodePty.resolve("node-pty/package.json")
  const packageDir = path.dirname(packageJsonPath)
  const helper = path.join(packageDir, "build", "Release", "spawn-helper")
  if (yield* fileSystem.exists(helper)) {
    yield* fileSystem.chmod(helper, 0o755).pipe(Effect.ignore)
  }
})

/** PTY Unix/Windows via node-pty — le serveur Noyau tourne sous Node. */
export const make = Effect.fn("NodePtyAdapter.make")(function* () {
  return PtyAdapter.of({
    spawn: Effect.fn("NodePtyAdapter.spawn")(function* (input: PtySpawnInput) {
      const nodePty = yield* Effect.tryPromise({
        try: () => import("node-pty") as Promise<NodePtyModule>,
        catch: (cause) =>
          new TerminalSpawnError({
            adapter: "node-pty",
            cwd: input.cwd,
            cause,
          }),
      })
      yield* chmodSpawnHelper().pipe(Effect.ignore)
      const env =
        process.platform === "win32" && input.env.TERM === undefined
          ? { ...input.env, TERM: "xterm-256color" }
          : input.env
      return yield* Effect.try({
        try: () =>
          new NodePtyProcess(
            nodePty.spawn(input.shell, [...(input.args ?? [])], {
              cwd: input.cwd,
              cols: input.cols,
              rows: input.rows,
              env,
              name: "xterm-256color",
            }),
          ),
        catch: (cause) =>
          new TerminalSpawnError({
            adapter: "node-pty",
            cwd: input.cwd,
            cause,
          }),
      })
    }),
  })
})

export const layer = Layer.effect(PtyAdapter, make())
