import { describe, expect, it } from "vite-plus/test"

import { decodeControlPlaneConfig } from "../src/lib/control-plane-config"

describe("control plane config", () => {
  it("utilise le bearer de développement sans choisir de projet", () => {
    expect(decodeControlPlaneConfig({})).toEqual({
      rpcUrl: "ws://127.0.0.1:3001/rpc",
      bearerToken: "noyau-development-token",
    })
  })

  it("décode les overrides RPC et bearer", () => {
    expect(
      decodeControlPlaneConfig({
        VITE_NOYAU_RPC_URL: "wss://noyau.example/rpc",
        VITE_NOYAU_BEARER_TOKEN: "launch-token",
      }),
    ).toEqual({
      rpcUrl: "wss://noyau.example/rpc",
      bearerToken: "launch-token",
    })
  })
})
