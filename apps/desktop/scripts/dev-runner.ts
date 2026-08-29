import { createServer } from "node:net"
import { fileURLToPath, pathToFileURL } from "node:url"

import { pointsAtLinkedWorktree, resolveDevHome, worktreeNoyauHome } from "@noyau/shared/dev-home"
import {
  exhaustedPortsMessage,
  invalidPortOffsetMessage,
  isBrowserAllowedPort,
  MAX_PORT,
  portPairForOffset,
  resolveOffset,
} from "@noyau/shared/dev-ports"
import { Deferred, Effect, Exit, FileSystem, Option, Path, Schema, Scope } from "effect"
import { ChildProcess } from "effect/unstable/process"

import { desktopDir } from "./electron-launcher.ts"
import { restoreTty } from "./restore-tty.ts"
import { scriptRuntime } from "./runtime.ts"

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url))
const DEV_PORT_PROBE_HOSTS = ["127.0.0.1", "::1"] as const
const DEV_MODES = ["dev", "dev:desktop", "dev:server", "dev:web"] as const

export type DevMode = (typeof DEV_MODES)[number]

export type DevRunnerArgs = {
  readonly mode: DevMode
  readonly homeDir: string | undefined
  readonly port: number | undefined
  readonly dryRun: boolean
}

export type DevRunnerEnvInput = {
  readonly serverPort: number
  readonly webPort: number
  readonly home: string | undefined
}

class DevRunnerUsageError extends Schema.TaggedError<DevRunnerUsageError>()("DevRunnerUsageError", {
  message: Schema.String,
}) {}

const isDevMode = (value: string): value is DevMode => DEV_MODES.some((mode) => mode === value)

export const parseDevRunnerArgs = (argv: ReadonlyArray<string>): DevRunnerArgs => {
  let mode: DevMode = "dev"
  let homeDir: string | undefined
  let port: number | undefined
  let dryRun = false
  let sawMode = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === undefined) {
      continue
    }
    if (arg === "--dry-run") {
      dryRun = true
      continue
    }
    if (arg === "--home-dir" || arg === "--port") {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith("--")) {
        throw new DevRunnerUsageError({ message: `${arg} requires a value` })
      }
      index += 1
      if (arg === "--home-dir") {
        homeDir = value
        continue
      }
      const parsed = Number(value)
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
        throw new DevRunnerUsageError({ message: "--port must be an integer between 1 and 65535" })
      }
      port = parsed
      continue
    }
    if (arg.startsWith("--")) {
      throw new DevRunnerUsageError({ message: `Unknown flag: ${arg}` })
    }
    if (!isDevMode(arg)) {
      throw new DevRunnerUsageError({
        message: `Unknown mode: ${arg}. Use ${DEV_MODES.join(", ")}.`,
      })
    }
    if (sawMode) {
      throw new DevRunnerUsageError({ message: "Pass a single mode" })
    }
    mode = arg
    sawMode = true
  }

  return { mode, homeDir, port, dryRun }
}

export const createDevRunnerEnv = (
  baseEnv: NodeJS.ProcessEnv,
  input: DevRunnerEnvInput,
): NodeJS.ProcessEnv => {
  const output: NodeJS.ProcessEnv = {
    ...baseEnv,
    PORT: String(input.webPort),
    NOYAU_PORT: String(input.serverPort),
    VITE_DEV_SERVER_URL: `http://127.0.0.1:${String(input.webPort)}/`,
    NOYAU_DEV_RENDERER_URL: `http://127.0.0.1:${String(input.webPort)}/`,
    VITE_NOYAU_RPC_URL: `ws://127.0.0.1:${String(input.serverPort)}/rpc`,
  }
  if (input.home !== undefined) {
    output.NOYAU_HOME = input.home
    output.NOYAU_DATA_DIR = input.home
  }
  return output
}

export const formatDevRunnerLine = (
  mode: DevMode,
  source: string,
  startOffset: number,
  selectedOffset: number,
  serverPort: number,
  webPort: number,
  baseDir: string,
): string => {
  const selectionSuffix =
    selectedOffset !== startOffset ? ` selectedOffset=${String(selectedOffset)}` : ""
  return `[dev-runner] mode=${mode} source=${source}${selectionSuffix} serverPort=${String(serverPort)} webPort=${String(webPort)} baseDir=${baseDir}`
}

export const bindsServerPort = (mode: DevMode, hasExplicitServerPort: boolean): boolean =>
  !hasExplicitServerPort && mode === "dev:server"

export const bindsWebPort = (mode: DevMode): boolean => mode !== "dev:server"

const optionalIntegerEnv = (name: string): number | undefined => {
  const raw = process.env[name]?.trim()
  if (raw === undefined || raw === "") {
    return undefined
  }
  const parsed = Number(raw)
  if (!Number.isInteger(parsed)) {
    throw new DevRunnerUsageError({ message: `${name} must be an integer` })
  }
  return parsed
}

const canListenOnHost = (port: number, host: string) =>
  Effect.callback<boolean>((resume) => {
    const server = createServer()
    const finish = (available: boolean) => {
      server.removeAllListeners()
      if (server.listening) {
        server.close(() => resume(Effect.succeed(available)))
        return
      }
      resume(Effect.succeed(available))
    }
    server.once("error", () => finish(false))
    server.listen({ host, port, exclusive: true }, () => finish(true))
    return Effect.sync(() => {
      server.removeAllListeners()
      if (server.listening) {
        server.close()
      }
    })
  })

const isLoopbackPortAvailable = (port: number) =>
  Effect.gen(function* () {
    for (const host of DEV_PORT_PROBE_HOSTS) {
      if (!(yield* canListenOnHost(port, host))) {
        return false
      }
    }
    return true
  })

const selectAvailableOffset = Effect.fn("selectAvailableOffset")(function* (
  startOffset: number,
  requireServerPort: boolean,
  requireWebPort: boolean,
) {
  for (let candidate = startOffset; ; candidate += 1) {
    const { serverPort, webPort } = portPairForOffset(candidate)
    const serverPortOutOfRange = serverPort > MAX_PORT
    const webPortOutOfRange = webPort > MAX_PORT
    if (
      (requireServerPort && serverPortOutOfRange) ||
      (requireWebPort && webPortOutOfRange) ||
      (!requireServerPort && !requireWebPort && (serverPortOutOfRange || webPortOutOfRange))
    ) {
      return yield* new DevRunnerUsageError({
        message: exhaustedPortsMessage(startOffset),
      })
    }
    if (requireWebPort && !isBrowserAllowedPort(webPort)) {
      continue
    }
    const serverOk = !requireServerPort || (yield* isLoopbackPortAvailable(serverPort))
    const webOk = !requireWebPort || (yield* isLoopbackPortAvailable(webPort))
    if (serverOk && webOk) {
      return candidate
    }
  }
})

const resolveGitWorktreePath = Effect.fn("resolveGitWorktreePath")(function* (cwd: string) {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  let directory = path.resolve(cwd)
  for (;;) {
    const gitPath = path.join(directory, ".git")
    const info = yield* fileSystem.stat(gitPath).pipe(Effect.option)
    if (Option.isSome(info)) {
      if (info.value.type !== "File") {
        return undefined
      }
      const contents = yield* fileSystem
        .readFileString(gitPath)
        .pipe(Effect.orElseSucceed(() => ""))
      return pointsAtLinkedWorktree(contents, (value) => path.normalize(value))
        ? directory
        : undefined
    }
    const parent = path.dirname(directory)
    if (parent === directory) {
      return undefined
    }
    directory = parent
  }
})

const resolveWorktreeHome = Effect.fn("resolveWorktreeHome")(function* (cwd: string) {
  const path = yield* Path.Path
  const worktreePath = yield* resolveGitWorktreePath(cwd)
  return worktreePath === undefined ? undefined : worktreeNoyauHome(worktreePath, path.join)
})

const runDevStack = Effect.fn("runDevStack")(function* (env: NodeJS.ProcessEnv) {
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
      env,
      extendEnv: false,
      detached: false,
      stdin: "ignore",
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
})

const spawnForeground = Effect.fn("spawnForeground")(function* (
  command: string,
  args: ReadonlyArray<string>,
  env: NodeJS.ProcessEnv,
) {
  const handle = yield* ChildProcess.make(command, args, {
    cwd: repositoryRoot,
    env,
    extendEnv: false,
    detached: false,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  const exitCode = yield* handle.exitCode
  process.exitCode = Number(exitCode)
})

const readOffsetConfig = Effect.fn("readOffsetConfig")(function* (
  worktreePath: string | undefined,
) {
  const resolved = yield* Effect.try({
    try: () =>
      resolveOffset(
        optionalIntegerEnv("NOYAU_PORT_OFFSET"),
        process.env.NOYAU_DEV_INSTANCE,
        worktreePath,
      ),
    catch: (error) =>
      new DevRunnerUsageError({
        message: error instanceof Error ? error.message : String(error),
      }),
  })
  if (resolved._tag === "invalid") {
    return yield* new DevRunnerUsageError({
      message: invalidPortOffsetMessage(resolved.portOffset),
    })
  }
  return resolved
})

export const runDevRunner = Effect.fn("runDevRunner")(function* (args: DevRunnerArgs) {
  const path = yield* Path.Path
  const worktreePath = yield* resolveGitWorktreePath(process.cwd())
  const { offset, source } = yield* readOffsetConfig(worktreePath)
  const selectedOffset = yield* selectAvailableOffset(
    offset,
    bindsServerPort(args.mode, args.port !== undefined),
    bindsWebPort(args.mode),
  )
  const pair = portPairForOffset(selectedOffset)
  const serverPort = args.port ?? pair.serverPort
  const webPort = pair.webPort
  const worktreeHome = yield* resolveWorktreeHome(process.cwd())
  const home = resolveDevHome(args.homeDir, worktreeHome, process.env.NOYAU_HOME)
  const resolvedHome = home === undefined ? undefined : path.resolve(home)
  const env = createDevRunnerEnv(process.env, {
    serverPort,
    webPort,
    home: resolvedHome,
  })
  const baseDir = resolvedHome ?? path.resolve(repositoryRoot, ".noyau")
  yield* Effect.sync(() => {
    process.stdout.write(
      `${formatDevRunnerLine(args.mode, source, offset, selectedOffset, serverPort, webPort, baseDir)}\n`,
    )
  })

  if (args.dryRun) {
    return
  }

  if (args.mode === "dev:server") {
    return yield* spawnForeground("node", ["--watch", "apps/server/src/main.ts"], env)
  }
  if (args.mode === "dev:web") {
    return yield* spawnForeground("vp", ["-C", "apps/web", "dev"], env)
  }
  return yield* runDevStack(env)
})

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  void scriptRuntime
    .runPromise(
      Effect.scoped(runDevRunner(parseDevRunnerArgs(process.argv.slice(2)))).pipe(
        Effect.tapError((error) =>
          Effect.sync(() => {
            process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
            process.exitCode = 1
          }),
        ),
      ),
    )
    .finally(() => {
      restoreTty()
    })
}
