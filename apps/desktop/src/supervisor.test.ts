import { Schema } from "effect"
import type { Socket } from "effect/unstable/socket"
import { describe, expect, it } from "vite-plus/test"

import {
  encodeBootstrap,
  probeRpc,
  restartDelayMs,
  ServerSupervisor,
  waitForServerReady,
  type ServerBootstrap,
} from "./supervisor"

const bootstrap = {
  dataDirectory: "/tmp/noyau",
  host: "127.0.0.1",
  port: 4567,
  bearerToken: "launch-token",
  actorId: "human:local",
  environmentId: "90000000-0000-4000-8000-000000000001",
  environmentCreatedAt: "2026-08-20T00:00:00.000Z",
  bootstrapVersion: "1",
  bundleVersion: "0.1.0",
  serverVersion: "0.1.0",
} satisfies ServerBootstrap

const RpcMessage = Schema.Union([
  Schema.TaggedStruct("Ping", {}),
  Schema.TaggedStruct("Request", {
    id: Schema.Union([Schema.String, Schema.Finite]),
    tag: Schema.String,
  }),
])

class FakeWebSocket extends EventTarget implements globalThis.WebSocket {
  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSING = 2
  readonly CLOSED = 3
  readonly requests: Array<{ readonly tag: string }> = []
  readonly extensions = ""
  readonly protocol = ""
  readonly url: string
  readonly bufferedAmount = 0
  binaryType: BinaryType = "blob"
  onclose: globalThis.WebSocket["onclose"] = null
  onerror: globalThis.WebSocket["onerror"] = null
  onmessage: globalThis.WebSocket["onmessage"] = null
  onopen: globalThis.WebSocket["onopen"] = null
  readyState = 0

  constructor(readonly protocols: string | Array<string> | undefined, url: string) {
    super()
    this.url = url
    queueMicrotask(() => {
      this.readyState = 1
      this.dispatchEvent(new Event("open"))
    })
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView<ArrayBufferLike>): void {
    if (typeof data !== "string") {
      throw new Error("FakeWebSocket only accepts JSON text")
    }
    const message = Schema.decodeUnknownSync(RpcMessage)(JSON.parse(data))
    if (message._tag === "Ping") {
      queueMicrotask(() => {
        const event = new Event("message")
        Object.defineProperty(event, "data", { value: JSON.stringify({ _tag: "Pong" }) })
        this.dispatchEvent(event)
      })
      return
    }

    this.requests.push({ tag: message.tag })
    queueMicrotask(() => {
      const event = new Event("message")
      Object.defineProperty(event, "data", {
        value: JSON.stringify({
          _tag: "Exit",
          requestId: message.id,
          exit: {
            _tag: "Success",
            value: {
              environmentId: bootstrap.environmentId,
              bundleVersion: bootstrap.bundleVersion,
              serverVersion: bootstrap.serverVersion,
              databaseSchemaVersion: 2,
            },
          },
        }),
      })
      this.dispatchEvent(event)
    })
  }

  close(_code?: number, _reason?: string): void {
    if (this.readyState === 3) return
    this.readyState = 3
    this.dispatchEvent(new Event("close"))
  }
}

describe("server supervisor", () => {
  it("caps restart backoff at ten seconds", () => {
    expect(restartDelayMs(1)).toBe(100)
    expect(restartDelayMs(7)).toBe(10_000)
    expect(restartDelayMs(99)).toBe(10_000)
  })

  it("writes a single versioned fd3 bootstrap envelope", () => {
    expect(encodeBootstrap(bootstrap)).toBe(`${JSON.stringify(bootstrap)}\n`)
  })

  it("probes server.getConfig over the authenticated JSON RPC protocol", async () => {
    const sockets: Array<FakeWebSocket> = []
    const webSocketConstructor: Socket.WebSocketConstructor["Service"] = (url, protocols) => {
      const socket = new FakeWebSocket(protocols, url)
      sockets.push(socket)
      return socket
    }

    await probeRpc(bootstrap, webSocketConstructor)

    expect(sockets).toHaveLength(1)
    expect(sockets[0]?.url).toBe("ws://127.0.0.1:4567/rpc")
    expect(sockets[0]?.protocols).toEqual(["noyau-bearer.launch-token"])
    expect(sockets[0]?.requests).toEqual([{ tag: "server.getConfig" }])
  })

  it("does not declare readiness when health and a socket pass but getConfig fails", async () => {
    let probeAttempts = 0
    await expect(
      waitForServerReady(bootstrap, {
        timeoutMs: 25,
        fetchImpl: async () => new Response(JSON.stringify({ status: "ready" }), { status: 200 }),
        probeRpc: async () => {
          probeAttempts += 1
          throw new Error("server.getConfig is unavailable")
        },
        sleep: async () => new Promise((resolve) => setTimeout(resolve, 5)),
      }),
    ).rejects.toThrow("server.getConfig is unavailable")
    expect(probeAttempts).toBeGreaterThan(0)
  })

  it("requires readiness and server.getConfig before declaring the child ready", async () => {
    const requests: Array<string> = []
    let probeAttempts = 0
    await waitForServerReady(bootstrap, {
      fetchImpl: async (input) => {
        requests.push(input)
        if (input.endsWith("/health/ready")) {
          return new Response(JSON.stringify({ status: "ready" }), { status: 200 })
        }
        return new Response(null, { status: 500 })
      },
      probeRpc: async () => {
        probeAttempts += 1
      },
      sleep: async () => undefined,
    })

    expect(requests).toEqual(["http://127.0.0.1:4567/health/ready"])
    expect(probeAttempts).toBe(1)
  })

  it("uses the supplied readiness probe and reports running Turns through the internal status", async () => {
    const requests: Array<string> = []
    const supervisor = new ServerSupervisor({
      serverEntryPath: "/unused/server.mjs",
      dataDirectory: bootstrap.dataDirectory,
      externalBootstrap: bootstrap,
      fetchImpl: async (input) => {
        requests.push(input)
        if (input.endsWith("/health/ready")) {
          return new Response(JSON.stringify({ status: "ready" }), { status: 200 })
        }
        return new Response(JSON.stringify({ runningTurn: true }), { status: 200 })
      },
      probeRpc: async () => undefined,
      sleep: async () => undefined,
    })

    await supervisor.start()

    expect(supervisor.state.phase).toBe("ready")
    expect(await supervisor.isTurnRunning()).toBe(true)
    expect(requests).toEqual([
      "http://127.0.0.1:4567/health/ready",
      "http://127.0.0.1:4567/internal/status",
    ])
  })
})
