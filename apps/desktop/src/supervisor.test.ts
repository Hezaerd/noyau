import { describe, expect, it } from "vite-plus/test"

import {
  encodeBootstrap,
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

describe("server supervisor", () => {
  it("caps restart backoff at ten seconds", () => {
    expect(restartDelayMs(1)).toBe(100)
    expect(restartDelayMs(7)).toBe(10_000)
    expect(restartDelayMs(99)).toBe(10_000)
  })

  it("writes a single versioned fd3 bootstrap envelope", () => {
    expect(encodeBootstrap(bootstrap)).toBe(`${JSON.stringify(bootstrap)}\n`)
  })

  it("requires readiness and server.getConfig before declaring the child ready", async () => {
    const requests: Array<string> = []
    await waitForServerReady(bootstrap, {
      fetchImpl: async (input) => {
        requests.push(String(input))
        if (String(input).endsWith("/health/ready")) {
          return new Response(JSON.stringify({ status: "ready" }), { status: 200 })
        }
        return new Response(
          JSON.stringify({
            environmentId: bootstrap.environmentId,
            bundleVersion: bootstrap.bundleVersion,
            serverVersion: bootstrap.serverVersion,
            databaseSchemaVersion: 2,
            actorId: bootstrap.actorId,
          }),
          { status: 200 },
        )
      },
      probeRpc: async () => undefined,
      sleep: async () => undefined,
    })

    expect(requests).toEqual([
      "http://127.0.0.1:4567/health/ready",
      "http://127.0.0.1:4567/internal/config",
    ])
  })

  it("uses the supplied readiness probe and reports running Turns through the internal status", async () => {
    const requests: Array<string> = []
    const supervisor = new ServerSupervisor({
      serverEntryPath: "/unused/server.mjs",
      dataDirectory: bootstrap.dataDirectory,
      externalBootstrap: bootstrap,
      fetchImpl: async (input) => {
        requests.push(String(input))
        if (String(input).endsWith("/health/ready")) {
          return new Response(JSON.stringify({ status: "ready" }), { status: 200 })
        }
        if (String(input).endsWith("/internal/config")) {
          return new Response(
            JSON.stringify({
              environmentId: bootstrap.environmentId,
              bundleVersion: bootstrap.bundleVersion,
              serverVersion: bootstrap.serverVersion,
              databaseSchemaVersion: 2,
              actorId: bootstrap.actorId,
            }),
            { status: 200 },
          )
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
      "http://127.0.0.1:4567/internal/config",
      "http://127.0.0.1:4567/internal/status",
    ])
  })
})
