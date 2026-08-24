import { createServer } from "node:net"

import { ControlPlaneRpcs, RPC_METHODS } from "@noyau/protocol/rpc"
import type { PlatformError } from "effect"
import {
  Clock,
  Config,
  Crypto,
  DateTime,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Path,
  Result,
  Schema,
  Scope,
  Stream,
} from "effect"
import { FetchHttpClient, HttpClient } from "effect/unstable/http"
import type { ChildProcessSpawner } from "effect/unstable/process"
import { ChildProcess } from "effect/unstable/process"
import { RpcClient, RpcSerialization } from "effect/unstable/rpc"
import { Socket } from "effect/unstable/socket"

import { RELEASE_CHANNEL_ENV, type DesktopReleaseChannel } from "./release-channel"

export const FORCE_KILL_AFTER_MS = 2_000
export const MAX_RESTART_FAILURES = 5
export const RESTART_WINDOW_MS = 60_000
export const RESTART_DELAYS_MS = [100, 250, 500, 1_000, 2_000, 5_000, 10_000] as const

export const ServerBootstrap = Schema.Struct({
  dataDirectory: Schema.NonEmptyString,
  host: Schema.Literals(["127.0.0.1", "::1"]),
  port: Schema.Int.check(
    Schema.makeFilter((port) => port > 0 && port <= 65_535, {
      expected: "a reserved loopback port",
    }),
  ),
  bearerToken: Schema.NonEmptyString,
  actorId: Schema.NonEmptyString,
  environmentId: Schema.NonEmptyString,
  environmentCreatedAt: Schema.NonEmptyString,
  bootstrapVersion: Schema.NonEmptyString,
  bundleVersion: Schema.NonEmptyString,
  serverVersion: Schema.NonEmptyString,
})
export type ServerBootstrap = (typeof ServerBootstrap)["Type"]

type FetchImplementation = typeof globalThis.fetch
type WebSocketConstructor = Socket.WebSocketConstructor["Service"]
type ChildHandle = ChildProcessSpawner.ChildProcessHandle
type SupervisorServices =
  | FileSystem.FileSystem
  | Path.Path
  | Crypto.Crypto
  | HttpClient.HttpClient
  | ChildProcessSpawner.ChildProcessSpawner

const LoopbackAddress = Schema.Struct({ port: Schema.Int })
const decodeLoopbackAddress = Schema.decodeUnknownEffect(LoopbackAddress)
const decodeBootstrapJson = Schema.decodeUnknownEffect(Schema.fromJsonString(ServerBootstrap))

class RpcProbeTimeout extends Schema.TaggedError<RpcProbeTimeout>()("RpcProbeTimeout", {
  message: Schema.String,
}) {}

export class SupervisorError extends Schema.TaggedError<SupervisorError>()("SupervisorError", {
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
}) {}

export type SupervisorPhase = "stopped" | "starting" | "ready" | "backoff" | "degraded" | "stopping"

export interface SupervisorState {
  readonly phase: SupervisorPhase
  readonly failures: number
  readonly pid?: number
  readonly lastError?: string
}

export interface ServerSupervisorOptions {
  readonly serverEntryPath: string
  readonly dataDirectory: string
  readonly bundleVersion?: string
  readonly serverVersion?: string
  readonly actorId?: string
  readonly environmentId?: string
  readonly environment?: "development" | "production"
  readonly releaseChannel?: DesktopReleaseChannel
  readonly externalBootstrap?: ServerBootstrap
  readonly executablePath?: string
  readonly fetchImpl?: FetchImplementation
  readonly probeRpc?: (bootstrap: ServerBootstrap) => Effect.Effect<void, SupervisorError>
  readonly onStateChange?: (state: SupervisorState) => void
  readonly onSpawned?: (bootstrap: ServerBootstrap) => void
}

interface MutableServerBootstrapOptions {
  dataDirectory: string
  bundleVersion?: string
  serverVersion?: string
  actorId?: string
  environmentId?: string
}

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")

const supervisorError = (message: string, cause?: unknown) =>
  new SupervisorError(cause === undefined ? { message } : { message, cause })

const flagEnabled = (name: string) => Config.boolean(name).pipe(Config.withDefault(false))

export const serverEnvironmentFromReleaseChannel = (
  channel: DesktopReleaseChannel,
): "development" | "production" => (channel === "development" ? "development" : "production")

const readinessProbe = (
  options: Pick<ServerSupervisorOptions, "probeRpc">,
):
  | { readonly probeRpc: (bootstrap: ServerBootstrap) => Effect.Effect<void, SupervisorError> }
  | {} => (options.probeRpc === undefined ? {} : { probeRpc: options.probeRpc })

const withSupervisorHttp = <A, E, R>(
  options: Pick<ServerSupervisorOptions, "fetchImpl">,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  options.fetchImpl === undefined
    ? effect
    : effect.pipe(Effect.provideService(FetchHttpClient.Fetch, options.fetchImpl))

export const restartDelayMs = (failureCount: number): number =>
  RESTART_DELAYS_MS[Math.min(Math.max(failureCount - 1, 0), RESTART_DELAYS_MS.length - 1)] ?? 10_000

export const encodeBootstrap = (bootstrap: ServerBootstrap): string =>
  `${JSON.stringify(bootstrap)}\n`

export const decodeExternalBootstrap = Effect.fn("decodeExternalBootstrap")(function* () {
  const enabled = yield* flagEnabled("NOYAU_DESKTOP_EXTERNAL_SERVER")
  if (!enabled) {
    return undefined
  }

  const fs = yield* FileSystem.FileSystem
  return yield* fs.readFileString("/dev/fd/3").pipe(
    Effect.flatMap(decodeBootstrapJson),
    Effect.mapError((cause) =>
      supervisorError(`Failed to decode the external server bootstrap: ${String(cause)}`, cause),
    ),
  )
})

export const reserveLoopbackPort = Effect.fn("reserveLoopbackPort")(function* () {
  const server = createServer()
  yield* Effect.callback<void, SupervisorError>((resume) => {
    server.once("error", (error) =>
      resume(Effect.fail(supervisorError("Failed to reserve a loopback port", error))),
    )
    server.listen({ host: "127.0.0.1", port: 0 }, () => resume(Effect.void))
  })
  const address = yield* decodeLoopbackAddress(server.address()).pipe(
    Effect.mapError((cause) =>
      supervisorError("Failed to decode the reserved loopback port", cause),
    ),
  )
  yield* Effect.callback<void, SupervisorError>((resume) => {
    server.close((error) =>
      resume(
        error
          ? Effect.fail(supervisorError("Failed to release the reserved loopback port", error))
          : Effect.void,
      ),
    )
  })
  return address.port
})

export const makeServerBootstrap = Effect.fn("makeServerBootstrap")(function* (options: {
  readonly dataDirectory: string
  readonly bundleVersion?: string
  readonly serverVersion?: string
  readonly actorId?: string
  readonly environmentId?: string
}) {
  const crypto = yield* Crypto.Crypto
  const createdAt = yield* DateTime.now
  const [port, tokenBytes, environmentId] = yield* Effect.all([
    reserveLoopbackPort(),
    crypto.randomBytes(32),
    options.environmentId === undefined
      ? crypto.randomUUIDv4
      : Effect.succeed(options.environmentId),
  ])
  return {
    dataDirectory: options.dataDirectory,
    host: "127.0.0.1" as const,
    port,
    bearerToken: bytesToHex(tokenBytes),
    actorId: options.actorId ?? "human:local",
    environmentId,
    environmentCreatedAt: DateTime.formatIso(createdAt),
    bootstrapVersion: "1",
    bundleVersion: options.bundleVersion ?? "0.1.0",
    serverVersion: options.serverVersion ?? "0.1.0",
  } satisfies ServerBootstrap
})

export const probeRpc = Effect.fn("probeRpc")(function* (
  bootstrap: ServerBootstrap,
  webSocketConstructor: WebSocketConstructor = (url, protocols) =>
    new globalThis.WebSocket(url, protocols),
) {
  const rpcLayer = RpcClient.layerProtocolSocket({ retryTransientErrors: false }).pipe(
    Layer.provide(
      Socket.layerWebSocket(`ws://${bootstrap.host}:${bootstrap.port}/rpc`, {
        openTimeout: 500,
        protocols: [`noyau-bearer.${bootstrap.bearerToken}`],
      }).pipe(Layer.provide(Layer.succeed(Socket.WebSocketConstructor)(webSocketConstructor))),
    ),
    Layer.provide(RpcSerialization.layerJson),
  )
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const context = yield* Layer.build(rpcLayer)
      const client = yield* RpcClient.make(ControlPlaneRpcs).pipe(Effect.provideContext(context))
      return yield* client[RPC_METHODS.getConfig]({}).pipe(
        Effect.timeoutOrElse({
          duration: 500,
          orElse: () => new RpcProbeTimeout({ message: "Timed out waiting for server.getConfig" }),
        }),
        Effect.provideContext(context),
      )
    }),
  )
})

export const waitForServerReady = Effect.fn("waitForServerReady")(function* (
  bootstrap: ServerBootstrap,
  options: {
    readonly timeoutMs?: number
    readonly probeRpc?: (bootstrap: ServerBootstrap) => Effect.Effect<void, SupervisorError>
  } = {},
) {
  const timeoutMs = options.timeoutMs ?? 15_000
  const startedAt = yield* Clock.currentTimeMillis
  const runProbe =
    options.probeRpc ??
    ((next: ServerBootstrap) =>
      probeRpc(next).pipe(
        Effect.mapError((cause) =>
          supervisorError(`server.getConfig is unavailable: ${String(cause)}`, cause),
        ),
      ))
  let lastError = supervisorError("The server has not started listening")

  while (true) {
    const now = yield* Clock.currentTimeMillis
    if (now - startedAt >= timeoutMs) {
      return yield* supervisorError(
        `Timed out waiting for server.getConfig: ${lastError.message}`,
        lastError,
      )
    }

    const health = yield* HttpClient.get(
      `http://${bootstrap.host}:${bootstrap.port}/health/ready`,
    ).pipe(Effect.timeout(500), Effect.result)
    if (Result.isFailure(health)) {
      lastError = supervisorError(String(health.failure), health.failure)
    } else if (health.success.status < 200 || health.success.status >= 300) {
      lastError = supervisorError(`health/readiness returned HTTP ${health.success.status}`)
    } else {
      const probed = yield* runProbe(bootstrap).pipe(Effect.result)
      if (Result.isSuccess(probed)) {
        return
      }
      lastError = probed.failure
    }
    yield* Effect.sleep(100)
  }
})

const waitForExit = (handle: ChildHandle, timeoutMs: number) =>
  handle.exitCode.pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => true),
    Effect.timeoutOrElse({
      duration: timeoutMs,
      orElse: () => Effect.succeed(false),
    }),
  )

export class ServerSupervisor {
  private readonly options: ServerSupervisorOptions
  private stateValue: SupervisorState = { phase: "stopped", failures: 0 }
  private child: ChildHandle | undefined
  private childScope: Scope.Closeable | undefined
  private bootstrapValue: ServerBootstrap | undefined
  private stopping = false
  private restartFiber: Fiber.Fiber<void> | undefined
  private failureTimes: Array<number> = []

  constructor(options: ServerSupervisorOptions) {
    this.options = options
  }

  get state(): SupervisorState {
    return this.stateValue
  }

  get bootstrap(): ServerBootstrap | undefined {
    return this.bootstrapValue
  }

  start(): Effect.Effect<void, SupervisorError | PlatformError.PlatformError, SupervisorServices> {
    return Effect.gen({ self: this }, function* () {
      this.stopping = false
      if (this.options.externalBootstrap !== undefined) {
        this.bootstrapValue = this.options.externalBootstrap
        this.setState({ phase: "starting", failures: 0 })
        this.options.onSpawned?.(this.options.externalBootstrap)
        yield* withSupervisorHttp(
          this.options,
          waitForServerReady(this.options.externalBootstrap, readinessProbe(this.options)),
        )
        this.setState({ phase: "ready", failures: 0 })
        return
      }

      yield* this.startWithRetries()
    })
  }

  stop() {
    return Effect.gen({ self: this }, function* () {
      this.stopping = true
      if (this.restartFiber !== undefined) {
        yield* Fiber.interrupt(this.restartFiber)
        this.restartFiber = undefined
      }
      this.setState({ phase: "stopping", failures: this.failureTimes.length })
      const bootstrap = this.bootstrapValue
      const child = this.child
      if (bootstrap !== undefined) {
        const smokeTest = yield* flagEnabled("NOYAU_DESKTOP_SMOKE_TEST")
        if (smokeTest) {
          yield* Effect.sync(() => {
            process.stdout.write("NOYAU_DESKTOP_SHUTDOWN_ENDPOINT_REQUESTED\n")
          })
        }
        yield* withSupervisorHttp(
          this.options,
          HttpClient.post(`http://${bootstrap.host}:${bootstrap.port}/internal/shutdown`, {
            headers: { authorization: `Bearer ${bootstrap.bearerToken}` },
          }).pipe(Effect.timeout(500), Effect.ignore),
        )
      }

      if (child !== undefined) {
        const exitedGracefully = yield* waitForExit(child, FORCE_KILL_AFTER_MS)
        if (!exitedGracefully) {
          yield* child.kill().pipe(Effect.ignore)
          yield* waitForExit(child, 500)
        }
      }
      yield* this.closeChildScope()
      this.child = undefined
      this.bootstrapValue = undefined
      this.setState({ phase: "stopped", failures: this.failureTimes.length })
    })
  }

  private setState(next: SupervisorState): void {
    this.stateValue = next
    this.options.onStateChange?.(next)
  }

  private startWithRetries(): Effect.Effect<
    void,
    SupervisorError | PlatformError.PlatformError,
    SupervisorServices
  > {
    return Effect.gen({ self: this }, function* () {
      while (!this.stopping) {
        const bootstrapOptions: MutableServerBootstrapOptions = {
          dataDirectory: this.options.dataDirectory,
        }
        if (this.options.bundleVersion !== undefined) {
          bootstrapOptions.bundleVersion = this.options.bundleVersion
        }
        if (this.options.serverVersion !== undefined) {
          bootstrapOptions.serverVersion = this.options.serverVersion
        }
        if (this.options.actorId !== undefined) {
          bootstrapOptions.actorId = this.options.actorId
        }
        if (this.options.environmentId !== undefined) {
          bootstrapOptions.environmentId = this.options.environmentId
        }
        const bootstrap = yield* makeServerBootstrap(bootstrapOptions)
        this.bootstrapValue = bootstrap
        this.setState({ phase: "starting", failures: this.failureTimes.length })

        const started = yield* this.spawn(bootstrap).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              this.options.onSpawned?.(bootstrap)
            }),
          ),
          Effect.andThen(
            withSupervisorHttp(
              this.options,
              waitForServerReady(bootstrap, readinessProbe(this.options)),
            ),
          ),
          Effect.as(true),
          Effect.catch((cause) =>
            Effect.gen({ self: this }, function* () {
              yield* this.recordFailure(cause)
              yield* this.killCapturedChild()
              if (this.stateValue.phase === "degraded") {
                return yield* Schema.is(SupervisorError)(cause)
                  ? cause
                  : supervisorError(String(cause), cause)
              }
              yield* Effect.sleep(restartDelayMs(this.failureTimes.length))
              return false
            }),
          ),
        )
        if (started) {
          const nextState =
            this.child?.pid === undefined
              ? { phase: "ready" as const, failures: this.failureTimes.length }
              : {
                  phase: "ready" as const,
                  failures: this.failureTimes.length,
                  pid: Number(this.child.pid),
                }
          this.setState(nextState)
          return
        }
      }
    })
  }

  private spawn(
    bootstrap: ServerBootstrap,
  ): Effect.Effect<void, PlatformError.PlatformError, SupervisorServices> {
    return Effect.gen({ self: this }, function* () {
      yield* this.closeChildScope()
      const childScope = yield* Scope.make()
      this.childScope = childScope
      const executable: string = this.options.executablePath ?? process.execPath
      const args: ReadonlyArray<string> = [this.options.serverEntryPath, "--bootstrap-fd", "3"]
      const bootstrapStream = Stream.encodeText(Stream.make(encodeBootstrap(bootstrap)))
      const handle = yield* ChildProcess.make(executable, args, {
        extendEnv: true,
        env: {
          ELECTRON_RUN_AS_NODE: "1",
          NOYAU_BOOTSTRAP_FD: "3",
          NOYAU_ENV: this.options.environment ?? "production",
          [RELEASE_CHANNEL_ENV]: this.options.releaseChannel ?? "latest",
        },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        additionalFds: {
          fd3: {
            type: "input",
            stream: bootstrapStream,
          },
        },
      }).pipe(Scope.provide(childScope))
      yield* Stream.decodeText(handle.stdout).pipe(
        Stream.runForEach((text) =>
          Effect.sync(() => {
            process.stdout.write(`[noyau-server] ${text}`)
          }),
        ),
        Effect.forkDetach,
      )
      yield* Stream.decodeText(handle.stderr).pipe(
        Stream.runForEach((text) =>
          Effect.sync(() => {
            process.stderr.write(`[noyau-server] ${text}`)
          }),
        ),
        Effect.forkDetach,
      )
      this.child = handle
      yield* handle.exitCode.pipe(
        Effect.ignore,
        Effect.andThen(this.onChildExit()),
        Effect.forkDetach,
      )
    })
  }

  private onChildExit(): Effect.Effect<
    void,
    SupervisorError | PlatformError.PlatformError,
    SupervisorServices
  > {
    return Effect.gen({ self: this }, function* () {
      if (!this.stopping && this.stateValue.phase === "ready") {
        yield* this.scheduleRestart(supervisorError("The Noyau Server exited unexpectedly"))
      }
    })
  }

  private recordFailure(cause: unknown) {
    return Effect.gen({ self: this }, function* () {
      const now = yield* Clock.currentTimeMillis
      this.failureTimes = this.failureTimes.filter(
        (timestamp) => now - timestamp < RESTART_WINDOW_MS,
      )
      this.failureTimes.push(now)
      const next = {
        phase: this.failureTimes.length >= MAX_RESTART_FAILURES ? "degraded" : "backoff",
        failures: this.failureTimes.length,
        lastError: String(cause),
      } as const
      this.setState(next)
    })
  }

  private scheduleRestart(
    cause: SupervisorError,
  ): Effect.Effect<void, SupervisorError | PlatformError.PlatformError, SupervisorServices> {
    return Effect.gen({ self: this }, function* () {
      if (this.restartFiber !== undefined || this.stopping) {
        return
      }
      yield* this.recordFailure(cause)
      if (this.stateValue.phase === "degraded") {
        return
      }
      this.restartFiber = yield* this.startWithRetries().pipe(
        Effect.delay(restartDelayMs(this.failureTimes.length)),
        Effect.tap(() =>
          Effect.sync(() => {
            this.restartFiber = undefined
          }),
        ),
        Effect.catch((error) =>
          Effect.sync(() => {
            this.restartFiber = undefined
            process.stderr.write(`[noyau-desktop] server degraded: ${String(error)}\n`)
          }),
        ),
        Effect.forkDetach,
      )
    })
  }

  private killCapturedChild() {
    return Effect.gen({ self: this }, function* () {
      const child = this.child
      this.child = undefined
      if (child === undefined) {
        yield* this.closeChildScope()
        return
      }
      const running = yield* child.isRunning.pipe(Effect.orElseSucceed(() => false))
      if (running) {
        yield* child.kill().pipe(Effect.ignore)
        yield* waitForExit(child, 500)
      }
      yield* this.closeChildScope()
    })
  }

  private closeChildScope() {
    return Effect.gen({ self: this }, function* () {
      const childScope = this.childScope
      this.childScope = undefined
      if (childScope !== undefined) {
        yield* Scope.close(childScope, Exit.void)
      }
    })
  }
}

export const resolveServerEntryPath = Effect.fn("resolveServerEntryPath")(function* (
  desktopDirectory: string,
  packaged = false,
) {
  const path = yield* Path.Path
  const configured = yield* Config.option(Config.string("NOYAU_SERVER_ENTRY"))
  if (Option.isSome(configured)) {
    return configured.value
  }
  const envPackaged = yield* flagEnabled("NOYAU_DESKTOP_PACKAGED")
  return path.join(
    packaged || envPackaged ? process.resourcesPath : desktopDirectory,
    "server",
    "main.mjs",
  )
})
