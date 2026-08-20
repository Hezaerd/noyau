import * as NodeServices from "@effect/platform-node/NodeServices"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber, Layer, Schema } from "effect"
import { TestClock } from "effect/testing"
import { FetchHttpClient } from "effect/unstable/http"
import type { Socket } from "effect/unstable/socket"

import {
  encodeBootstrap,
  probeRpc,
  restartDelayMs,
  ServerSupervisor,
  SupervisorError,
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
  readyState: 0 | 1 | 2 | 3 = 0
  readonly protocols: string | Array<string> | undefined

  constructor(protocols: string | Array<string> | undefined, url: string) {
    super()
    this.protocols = protocols
    this.url = url
    queueMicrotask(() => {
      this.readyState = 1
      this.dispatchEvent(new Event("open"))
    })
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    const encoded = Schema.decodeUnknownSync(Schema.String)(data)
    const message = Schema.decodeSync(Schema.fromJsonString(RpcMessage))(encoded)
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

const readyFetch: typeof globalThis.fetch = () =>
  Promise.resolve(new Response(JSON.stringify({ status: "ready" }), { status: 200 }))

const fetchByUrl =
  (handler: (input: string) => Response): typeof globalThis.fetch =>
  (input) => {
    const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input
    return Promise.resolve(handler(url))
  }

const supervisorLayer = Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer)

describe("server supervisor", () => {
  it("caps restart backoff at ten seconds", () => {
    expect(restartDelayMs(1)).toBe(100)
    expect(restartDelayMs(7)).toBe(10_000)
    expect(restartDelayMs(99)).toBe(10_000)
  })

  it("writes a single versioned fd3 bootstrap envelope", () => {
    expect(encodeBootstrap(bootstrap)).toBe(`${JSON.stringify(bootstrap)}\n`)
  })
})

it.layer(supervisorLayer)("server supervisor effects", (spec) => {
  spec.effect("probes server.getConfig over the authenticated JSON RPC protocol", () =>
    Effect.gen(function* () {
      const sockets: Array<FakeWebSocket> = []
      const webSocketConstructor: Socket.WebSocketConstructor["Service"] = (url, protocols) => {
        const socket = new FakeWebSocket(protocols, url)
        sockets.push(socket)
        return socket
      }

      yield* probeRpc(bootstrap, webSocketConstructor)

      expect(sockets).toHaveLength(1)
      expect(sockets[0]?.url).toBe("ws://127.0.0.1:4567/rpc")
      expect(sockets[0]?.protocols).toEqual(["noyau-bearer.launch-token"])
      expect(sockets[0]?.requests).toEqual([{ tag: "server.getConfig" }])
    }),
  )

  spec.effect("does not declare readiness when health and a socket pass but getConfig fails", () =>
    Effect.gen(function* () {
      let probeAttempts = 0
      const waiting = yield* waitForServerReady(bootstrap, {
        timeoutMs: 25,
        probeRpc: () => {
          probeAttempts += 1
          return Effect.fail(new SupervisorError({ message: "server.getConfig is unavailable" }))
        },
      }).pipe(
        Effect.provideService(FetchHttpClient.Fetch, readyFetch),
        Effect.flip,
        Effect.forkChild,
      )
      yield* TestClock.adjust(200)
      const error = yield* Fiber.join(waiting)

      expect(error.message).toContain("server.getConfig is unavailable")
      expect(probeAttempts).toBeGreaterThan(0)
    }),
  )

  spec.effect("requires readiness and server.getConfig before declaring the child ready", () =>
    Effect.gen(function* () {
      const requests: Array<string> = []
      let probeAttempts = 0
      yield* waitForServerReady(bootstrap, {
        probeRpc: () => {
          probeAttempts += 1
          return Effect.void
        },
      }).pipe(
        Effect.provideService(
          FetchHttpClient.Fetch,
          fetchByUrl((input) => {
            requests.push(input)
            if (input.endsWith("/health/ready")) {
              return new Response(JSON.stringify({ status: "ready" }), { status: 200 })
            }
            return new Response(null, { status: 500 })
          }),
        ),
      )

      expect(requests).toEqual(["http://127.0.0.1:4567/health/ready"])
      expect(probeAttempts).toBe(1)
    }),
  )

  spec.effect("uses the supplied readiness probe for an external bootstrap", () =>
    Effect.gen(function* () {
      const requests: Array<string> = []
      const supervisor = new ServerSupervisor({
        serverEntryPath: "/unused/server.mjs",
        dataDirectory: bootstrap.dataDirectory,
        externalBootstrap: bootstrap,
        fetchImpl: fetchByUrl((input) => {
          requests.push(input)
          if (input.endsWith("/health/ready")) {
            return new Response(JSON.stringify({ status: "ready" }), { status: 200 })
          }
          return new Response(null, { status: 500 })
        }),
        probeRpc: () => Effect.void,
      })

      yield* supervisor.start()

      expect(supervisor.state.phase).toBe("ready")
      expect(requests).toEqual(["http://127.0.0.1:4567/health/ready"])
    }),
  )
})
