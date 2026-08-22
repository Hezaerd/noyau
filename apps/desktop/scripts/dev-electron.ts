import { Deferred, Effect, Exit, Fiber, FileSystem, Path, Scope, Stream } from "effect"
import type { ChildProcessSpawner } from "effect/unstable/process"
import { ChildProcess } from "effect/unstable/process"

import { desktopDir, resolveElectronLaunchCommand } from "./electron-launcher.ts"
import { restoreTty } from "./restore-tty.ts"
import { scriptRuntime } from "./runtime.ts"
import { waitForResources } from "./wait-for-resources.ts"

type ChildHandle = ChildProcessSpawner.ChildProcessHandle

const watchedDesktopBundles = new Set(["main.cjs", "preload.cjs"])
const watchedServerBundles = new Set(["main.mjs"])

const electronArguments =
  process.platform === "linux"
    ? ["--no-sandbox", "dist-electron/main.cjs"]
    : ["dist-electron/main.cjs"]

const devElectron = Effect.fn("devElectron")(function* () {
  const path = yield* Path.Path
  const fs = yield* FileSystem.FileSystem
  const repositoryRoot = path.resolve(desktopDir, "../..")
  const bundleDirectory = path.join(desktopDir, "dist-electron")
  const serverBundleDirectory = path.join(repositoryRoot, "apps/server/dist")
  const serverEntry = path.join(serverBundleDirectory, "main.mjs")

  let electronHandle: ChildHandle | undefined
  let restartFiber: Fiber.Fiber<void, unknown> | undefined
  let shuttingDown = false
  const electronScope = yield* Scope.make()
  const done = yield* Deferred.make<number>()

  const startElectron = Effect.fn("startElectron")(function* () {
    if (shuttingDown || electronHandle !== undefined) {
      return
    }

    const launch = yield* resolveElectronLaunchCommand(electronArguments, "development")
    electronHandle = yield* ChildProcess.make(launch.electronPath, launch.args, {
      cwd: desktopDir,
      extendEnv: true,
      env: {
        ELECTRON_RUN_AS_NODE: undefined,
        NOYAU_RELEASE_CHANNEL: "development",
        NOYAU_SERVER_ENTRY: serverEntry,
      },
      detached: false,
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
    }).pipe(Scope.provide(electronScope))
    yield* electronHandle.exitCode.pipe(
      Effect.matchEffect({
        onFailure: () => Effect.void,
        onSuccess: (code) =>
          Effect.sync(() => {
            electronHandle = undefined
            if (!shuttingDown && Number(code) !== 0) {
              process.exitCode = Number(code)
            }
          }),
      }),
      Effect.forkDetach,
    )
  })

  const stopChild = Effect.fn("stopChild")(function* (handle: ChildHandle | undefined) {
    if (handle === undefined) {
      return
    }
    const running = yield* handle.isRunning.pipe(Effect.orElseSucceed(() => false))
    if (!running) {
      return
    }
    yield* handle.kill().pipe(Effect.ignore)
    yield* handle.exitCode.pipe(Effect.ignore, Effect.timeout(2_000), Effect.ignore)
  })

  const scheduleRestart = Effect.fn("scheduleRestart")(function* () {
    if (restartFiber !== undefined) {
      yield* Fiber.interrupt(restartFiber)
    }
    restartFiber = yield* Effect.sleep(150).pipe(
      Effect.andThen(
        Effect.gen(function* () {
          restartFiber = undefined
          const current = electronHandle
          electronHandle = undefined
          yield* stopChild(current)
          yield* startElectron()
        }),
      ),
      Effect.forkDetach,
    )
  })

  const watchBundleDirectory = Effect.fn("watchBundleDirectory")(function* (
    directory: string,
    watchedFiles: ReadonlySet<string>,
  ) {
    yield* fs.watch(directory).pipe(
      Stream.runForEach((event) =>
        watchedFiles.has(path.basename(event.path)) ? scheduleRestart() : Effect.void,
      ),
      Effect.forkDetach,
    )
  })

  yield* waitForResources({
    baseDirectory: desktopDir,
    files: ["dist-electron/main.cjs", "dist-electron/preload.cjs", "../server/dist/main.mjs"],
    host: "127.0.0.1",
    port: 5173,
  })
  yield* startElectron()
  yield* watchBundleDirectory(bundleDirectory, watchedDesktopBundles)
  yield* watchBundleDirectory(serverBundleDirectory, watchedServerBundles)

  const shutdown = Effect.fn("shutdown")(function* (exitCode: number) {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    if (restartFiber !== undefined) {
      yield* Fiber.interrupt(restartFiber)
    }
    yield* stopChild(electronHandle)
    yield* Scope.close(electronScope, Exit.void)
    process.exitCode = exitCode
  })

  yield* Effect.sync(() => {
    process.once("SIGINT", () => void scriptRuntime.runPromise(Deferred.succeed(done, 130)))
    process.once("SIGTERM", () => void scriptRuntime.runPromise(Deferred.succeed(done, 143)))
    process.once("SIGHUP", () => void scriptRuntime.runPromise(Deferred.succeed(done, 129)))
  })

  const exitCode = yield* Deferred.await(done)
  yield* shutdown(exitCode)
  restoreTty()
})

void scriptRuntime.runPromise(Effect.scoped(devElectron()))
