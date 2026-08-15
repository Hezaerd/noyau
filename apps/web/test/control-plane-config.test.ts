import { describe, expect, it } from "vite-plus/test"

import { decodeControlPlaneConfig } from "../src/lib/control-plane-config"

describe("control plane config", () => {
  it("utilise le projet de développement sans exposer d'identité cliente", () => {
    expect(decodeControlPlaneConfig({})).toEqual({
      rpcUrl: "ws://127.0.0.1:3001/rpc",
      projectId: "10000000-0000-4000-8000-000000000001",
    })
  })

  it("décode les overrides RPC et projet", () => {
    expect(
      decodeControlPlaneConfig({
        VITE_NOYAU_RPC_URL: "wss://noyau.example/rpc",
        VITE_NOYAU_PROJECT_ID: "10000000-0000-4000-8000-000000000099",
      }),
    ).toEqual({
      rpcUrl: "wss://noyau.example/rpc",
      projectId: "10000000-0000-4000-8000-000000000099",
    })
  })
})
