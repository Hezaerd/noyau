import { spawn, type ChildProcess } from "node:child_process"
import { randomBytes, randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { createServer } from "node:net"
import { join } from "node:path"
import type { Writable } from "node:stream"

import { Schema } from "effect"

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

const ServerConfigResponse = Schema.Struct({
  environmentId: Schema.NonEmptyString,
  bundleVersion: Schema.NonEmptyString,
  serverVersion: Schema.NonEmptyString,
  databaseSchemaVersion: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  actorId: Schema.NonEmptyString,
})

const ServerStatusResponse = Schema.Struct({
  runningTurn: Schema.Boolean,
})

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
  readonly externalBootstrap?: ServerBootstrap
  readonly executablePath?: string
  readonly fetchImpl?: typeof fetch
  readonly sleep?: (milliseconds: number) => Promise<void>
  readonly probeRpc?: (bootstrap: ServerBootstrap) => Promise<void>
  readonly onStateChange?: (state: SupervisorState) => void
}

type ReadinessOptions = {
  fetchImpl?: typeof fetch
  sleep?: (milliseconds: number) => Promise<void>
  probeRpc?: (bootstrap: ServerBootstrap) => Promise<void>
}

const readinessOptions = (options: ServerSupervisorOptions): ReadinessOptions => {
  const result: ReadinessOptions = {}
  if (options.fetchImpl !== undefined) {
    result.fetchImpl = options.fetchImpl
  }
  if (options.sleep !== undefined) {
    result.sleep = options.sleep
  }
  if (options.probeRpc !== undefined) {
    result.probeRpc = options.probeRpc
  }
  return result
}

export const restartDelayMs = (failureCount: number): number =>
  RESTART_DELAYS_MS[Math.min(Math.max(failureCount - 1, 0), RESTART_DELAYS_MS.length - 1)] ?? 10_000

export const encodeBootstrap = (bootstrap: ServerBootstrap): string =>
  `${JSON.stringify(bootstrap)}\n`

export const decodeExternalBootstrap = (): ServerBootstrap | undefined => {
  if (process.env.NOYAU_DESKTOP_EXTERNAL_SERVER !== "1") {
    return undefined
  }

  try {
    return Schema.decodeUnknownSync(ServerBootstrap)(
      JSON.parse(readFileSync(3, { encoding: "utf8" })),
    )
  } catch (cause) {
    throw new Error(`Failed to decode the external server bootstrap: ${String(cause)}`, { cause })
  }
}

export const reserveLoopbackPort = async (): Promise<number> => {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen({ host: "127.0.0.1", port: 0 }, () => resolve())
  })
  const address = Schema.decodeUnknownSync(Schema.Struct({ port: Schema.Int }))(server.address())
  const port = address.port
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
  return port
}

export const makeServerBootstrap = async (options: {
  readonly dataDirectory: string
  readonly bundleVersion?: string
  readonly serverVersion?: string
  readonly actorId?: string
  readonly environmentId?: string
}): Promise<ServerBootstrap> => ({
  dataDirectory: options.dataDirectory,
  host: "127.0.0.1",
  port: await reserveLoopbackPort(),
  bearerToken: randomBytes(32).toString("hex"),
  actorId: options.actorId ?? "human:local",
  environmentId: options.environmentId ?? randomUUID(),
  environmentCreatedAt: new Date().toISOString(),
  bootstrapVersion: "1",
  bundleVersion: options.bundleVersion ?? "0.1.0",
  serverVersion: options.serverVersion ?? "0.1.0",
})

const fetchServerConfig = async (
  bootstrap: ServerBootstrap,
  fetchImpl: typeof fetch,
): Promise<void> => {
  const response = await fetchImpl(`http://${bootstrap.host}:${bootstrap.port}/internal/config`, {
    headers: { authorization: `Bearer ${bootstrap.bearerToken}` },
    signal: AbortSignal.timeout(500),
  })
  if (!response.ok) {
    throw new Error(`server.getConfig returned HTTP ${response.status}`)
  }
  Schema.decodeUnknownSync(ServerConfigResponse)(await response.json())
}

const probeRpc = async (bootstrap: ServerBootstrap): Promise<void> => {
  const WebSocketConstructor = globalThis.WebSocket
  if (WebSocketConstructor === undefined) {
    throw new Error("The desktop runtime does not provide WebSocket")
  }
  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocketConstructor(
      `ws://${bootstrap.host}:${bootstrap.port}/rpc?token=${encodeURIComponent(bootstrap.bearerToken)}`,
    )
    const timeout = setTimeout(() => {
      socket.close()
      reject(new Error("Timed out opening the RPC WebSocket"))
    }, 500)
    socket.addEventListener("open", () => {
      clearTimeout(timeout)
      socket.close()
      resolve()
    })
    socket.addEventListener("error", () => {
      clearTimeout(timeout)
      reject(new Error("The RPC WebSocket rejected the launch bearer"))
    })
  })
}

export const waitForServerReady = async (
  bootstrap: ServerBootstrap,
  options: {
    readonly timeoutMs?: number
    readonly fetchImpl?: typeof fetch
    readonly sleep?: (milliseconds: number) => Promise<void>
    readonly probeRpc?: (bootstrap: ServerBootstrap) => Promise<void>
  } = {},
): Promise<void> => {
  const timeoutMs = options.timeoutMs ?? 15_000
  const fetchImpl = options.fetchImpl ?? fetch
  const sleep =
    options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
  const startedAt = Date.now()
  let lastError = new Error("The server has not started listening")
  const attempt = async (): Promise<void> => {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`Timed out waiting for server.getConfig: ${String(lastError)}`)
    }
    try {
      const live = await fetchImpl(`http://${bootstrap.host}:${bootstrap.port}/health/ready`, {
        signal: AbortSignal.timeout(500),
      })
      if (live.ok) {
        await fetchServerConfig(bootstrap, fetchImpl)
        await (options.probeRpc ?? probeRpc)(bootstrap)
        return
      }
      lastError = new Error(`health/readiness returned HTTP ${live.status}`)
    } catch (cause) {
      lastError = cause instanceof Error ? cause : new Error(String(cause), { cause })
    }
    await sleep(100)
    return attempt()
  }
  return attempt()
}

const waitForExit = (child: ChildProcess, timeoutMs: number): Promise<boolean> =>
  new Promise((resolve) => {
    let settled = false
    const finish = (exited: boolean) => {
      if (settled) return
      settled = true
      resolve(exited)
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      finish(true)
      return
    }
    let timer: NodeJS.Timeout | undefined = setTimeout(() => {
      timer = undefined
      finish(false)
    }, timeoutMs)
    child.once("exit", () => {
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
      finish(true)
    })
  })

export class ServerSupervisor {
  private readonly options: ServerSupervisorOptions
  private stateValue: SupervisorState = { phase: "stopped", failures: 0 }
  private child: ChildProcess | undefined
  private bootstrapValue: ServerBootstrap | undefined
  private stopping = false
  private restartTask: Promise<void> | undefined
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

  async start(): Promise<void> {
    this.stopping = false
    if (this.options.externalBootstrap !== undefined) {
      this.bootstrapValue = this.options.externalBootstrap
      this.setState({ phase: "starting", failures: 0 })
      await waitForServerReady(this.options.externalBootstrap, readinessOptions(this.options))
      this.setState({ phase: "ready", failures: 0 })
      return
    }

    await this.startWithRetries()
  }

  async isTurnRunning(): Promise<boolean> {
    const bootstrap = this.bootstrapValue
    if (bootstrap === undefined) {
      return false
    }
    const response = await (this.options.fetchImpl ?? fetch)(
      `http://${bootstrap.host}:${bootstrap.port}/internal/status`,
      {
        headers: { authorization: `Bearer ${bootstrap.bearerToken}` },
        signal: AbortSignal.timeout(500),
      },
    )
    if (!response.ok) {
      throw new Error(`server.getStatus returned HTTP ${response.status}`)
    }
    return Schema.decodeUnknownSync(ServerStatusResponse)(await response.json()).runningTurn
  }

  async stop(): Promise<void> {
    this.stopping = true
    this.setState({ phase: "stopping", failures: this.failureTimes.length })
    const bootstrap = this.bootstrapValue
    const child = this.child
    if (bootstrap !== undefined) {
      try {
        await (this.options.fetchImpl ?? fetch)(
          `http://${bootstrap.host}:${bootstrap.port}/internal/shutdown`,
          {
            method: "POST",
            headers: { authorization: `Bearer ${bootstrap.bearerToken}` },
            signal: AbortSignal.timeout(500),
          },
        )
      } catch {
        // The child may have already exited; the captured handle below is authoritative.
      }
    }

    if (child !== undefined) {
      const exitedGracefully = await waitForExit(child, FORCE_KILL_AFTER_MS)
      if (!exitedGracefully) {
        child.kill()
        await waitForExit(child, 500)
      }
    }
    this.child = undefined
    this.bootstrapValue = undefined
    this.setState({ phase: "stopped", failures: this.failureTimes.length })
  }

  private setState(next: SupervisorState): void {
    this.stateValue = next
    this.options.onStateChange?.(next)
  }

  private async startWithRetries(): Promise<void> {
    if (this.stopping) {
      return
    }
    const bootstrapOptions: {
      dataDirectory: string
      bundleVersion?: string
      serverVersion?: string
      actorId?: string
      environmentId?: string
    } = {
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
    const bootstrap = await makeServerBootstrap(bootstrapOptions)
    this.bootstrapValue = bootstrap
    this.setState({ phase: "starting", failures: this.failureTimes.length })

    try {
      await this.spawn(bootstrap)
      await waitForServerReady(bootstrap, readinessOptions(this.options))
      const nextState =
        this.child?.pid === undefined
          ? { phase: "ready" as const, failures: this.failureTimes.length }
          : {
              phase: "ready" as const,
              failures: this.failureTimes.length,
              pid: this.child.pid,
            }
      this.setState(nextState)
    } catch (cause) {
      this.recordFailure(cause)
      await this.killCapturedChild()
      if (this.stateValue.phase === "degraded") {
        throw cause
      }
      await this.sleep(restartDelayMs(this.failureTimes.length))
      return this.startWithRetries()
    }
  }

  private async spawn(bootstrap: ServerBootstrap): Promise<void> {
    const child = spawn(
      this.options.executablePath ?? process.execPath,
      [this.options.serverEntryPath, "--bootstrap-fd", "3"],
      {
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
          NOYAU_BOOTSTRAP_FD: "3",
        },
        stdio: ["ignore", "pipe", "pipe", "pipe"],
      },
    )
    this.child = child
    child.stdout?.on("data", (chunk) => process.stdout.write(`[noyau-server] ${chunk}`))
    child.stderr?.on("data", (chunk) => process.stderr.write(`[noyau-server] ${chunk}`))
    // SAFETY: stdio index 3 is configured as a writable pipe in this spawn call.
    const bootstrapPipe = child.stdio[3] as Writable | null
    bootstrapPipe?.end(encodeBootstrap(bootstrap))
    child.once("exit", () => {
      if (!this.stopping && this.stateValue.phase === "ready") {
        this.scheduleRestart(new Error("The Noyau Server exited unexpectedly"))
      }
    })
  }

  private recordFailure(cause: unknown): void {
    const now = Date.now()
    this.failureTimes = this.failureTimes.filter((timestamp) => now - timestamp < RESTART_WINDOW_MS)
    this.failureTimes.push(now)
    const next = {
      phase: this.failureTimes.length >= MAX_RESTART_FAILURES ? "degraded" : "backoff",
      failures: this.failureTimes.length,
      lastError: String(cause),
    } as const
    this.setState(next)
  }

  private scheduleRestart(cause: Error): void {
    if (this.restartTask !== undefined || this.stopping) {
      return
    }
    this.recordFailure(cause)
    if (this.stateValue.phase === "degraded") {
      return
    }
    this.restartTask = (async () => {
      await this.sleep(restartDelayMs(this.failureTimes.length))
      this.restartTask = undefined
      await this.startWithRetries().catch((error) => {
        process.stderr.write(`[noyau-desktop] server degraded: ${String(error)}\n`)
      })
    })()
  }

  private sleep(milliseconds: number): Promise<void> {
    return (
      this.options.sleep?.(milliseconds) ??
      new Promise((resolve) => setTimeout(resolve, milliseconds))
    )
  }

  private async killCapturedChild(): Promise<void> {
    const child = this.child
    if (child === undefined) {
      return
    }
    this.child = undefined
    if (child.exitCode === null && child.signalCode === null) {
      child.kill()
      await waitForExit(child, 500)
    }
  }
}

export const resolveServerEntryPath = (desktopDirectory: string): string =>
  process.env.NOYAU_SERVER_ENTRY ??
  join(
    process.env.NOYAU_DESKTOP_PACKAGED === "1" ? process.resourcesPath : desktopDirectory,
    "server",
    "main.mjs",
  )
