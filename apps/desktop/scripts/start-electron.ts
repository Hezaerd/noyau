import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"

import { desktopDir, resolveElectronLaunchCommand } from "./electron-launcher.ts"
import { scriptRuntime } from "./runtime.ts"

const startElectron = Effect.fn("startElectron")(function* () {
  const electronArguments =
    process.platform === "linux"
      ? ["--no-sandbox", "dist-electron/main.cjs"]
      : ["dist-electron/main.cjs"]
  const launch = yield* resolveElectronLaunchCommand(electronArguments, false)
  const handle = yield* ChildProcess.make(launch.electronPath, launch.args, {
    cwd: desktopDir,
    extendEnv: true,
    env: { ELECTRON_RUN_AS_NODE: undefined },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  const code = yield* handle.exitCode.pipe(
    Effect.catch((error) => {
      const signal = /signal: '([A-Z0-9]+)'/u.exec(String(error))?.[1]
      if (signal !== undefined) {
        process.kill(process.pid, signal)
        return Effect.never
      }
      return Effect.succeed(1)
    }),
  )
  return yield* Effect.sync(() => {
    process.exit(Number(code))
  })
})

void scriptRuntime.runPromise(Effect.scoped(startElectron()))
