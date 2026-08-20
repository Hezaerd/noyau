import { fileURLToPath } from "node:url"

import { Deferred, Effect, Exit, Scope } from "effect"
import { ChildProcess } from "effect/unstable/process"

import { desktopDir } from "./electron-launcher.ts"
import { scriptRuntime } from "./runtime.ts"

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url))

const devStack = Effect.fn("devStack")(function* () {
  const stackScope = yield* Scope.make()
  let shuttingDown = false
  const done = yield* Deferred.make<number>()

  const shutdown = Effect.fn("shutdownDevStack")(function* (exitCode: number) {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    yield* Scope.close(stackScope, Exit.void)
    yield* Deferred.succeed(done, exitCode)
  })

  const spawn = Effect.fn("spawnDevProcess")(function* (
    command: string,
    args: ReadonlyArray<string>,
    cwd: string = repositoryRoot,
  ) {
    const handle = yield* ChildProcess.make(command, args, {
      cwd,
      extendEnv: true,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    }).pipe(Scope.provide(stackScope))
    yield* handle.exitCode.pipe(
      Effect.flatMap((code) =>
        !shuttingDown && Number(code) !== 0 ? shutdown(Number(code)) : Effect.void,
      ),
      Effect.ignore,
      Effect.forkDetach,
    )
    return handle
  })

  yield* spawn("vp", ["-C", "apps/web", "dev"])
  yield* spawn("vp", ["-C", "apps/server", "pack", "--watch"])
  yield* spawn("vp", ["-C", "apps/desktop", "pack", "--watch"])
  yield* spawn("node", ["scripts/dev-electron.ts"], desktopDir)

  yield* Effect.sync(() => {
    process.once("SIGINT", () => void scriptRuntime.runPromise(shutdown(130)))
    process.once("SIGTERM", () => void scriptRuntime.runPromise(shutdown(143)))
    process.once("SIGHUP", () => void scriptRuntime.runPromise(shutdown(129)))
  })

  const exitCode = yield* Deferred.await(done)
  process.exitCode = exitCode
  process.exit(exitCode)
})

void scriptRuntime.runPromise(Effect.scoped(devStack()))
