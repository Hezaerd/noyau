import { describe, expect, it } from "vitest"

import {
  decodeControlPlaneConfig,
  DESKTOP_RUNTIME_STORAGE_KEY,
  resolveDesktopRuntimeEnvironment,
} from "../src/lib/control-plane-config"

const memoryStorage = (initial?: Readonly<Record<string, string>>) => {
  const values = new Map(Object.entries(initial ?? {}))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    values,
  }
}

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

  it("persiste le bootstrap desktop lu dans le search", () => {
    const storage = memoryStorage()

    expect(
      resolveDesktopRuntimeEnvironment(
        "?rpc=ws%3A%2F%2F127.0.0.1%3A4567%2Frpc&token=launch-token",
        storage,
      ),
    ).toEqual({
      VITE_NOYAU_RPC_URL: "ws://127.0.0.1:4567/rpc",
      VITE_NOYAU_BEARER_TOKEN: "launch-token",
    })
    expect(storage.values.get(DESKTOP_RUNTIME_STORAGE_KEY)).toBe(
      '{"rpcUrl":"ws://127.0.0.1:4567/rpc","bearerToken":"launch-token"}',
    )
  })

  it("reprend le bootstrap desktop après un search vidé par le routeur", () => {
    const storage = memoryStorage({
      [DESKTOP_RUNTIME_STORAGE_KEY]:
        '{"rpcUrl":"ws://127.0.0.1:4567/rpc","bearerToken":"launch-token"}',
    })

    expect(resolveDesktopRuntimeEnvironment("?ticket=tick_1", storage)).toEqual({
      VITE_NOYAU_RPC_URL: "ws://127.0.0.1:4567/rpc",
      VITE_NOYAU_BEARER_TOKEN: "launch-token",
    })
  })

  it("laisse le search du lancement remplacer un bootstrap desktop périmé", () => {
    const storage = memoryStorage({
      [DESKTOP_RUNTIME_STORAGE_KEY]:
        '{"rpcUrl":"ws://127.0.0.1:3001/rpc","bearerToken":"stale-token"}',
    })

    expect(
      resolveDesktopRuntimeEnvironment(
        "?rpc=ws%3A%2F%2F127.0.0.1%3A4567%2Frpc&token=fresh-token",
        storage,
      ),
    ).toEqual({
      VITE_NOYAU_RPC_URL: "ws://127.0.0.1:4567/rpc",
      VITE_NOYAU_BEARER_TOKEN: "fresh-token",
    })
    expect(storage.values.get(DESKTOP_RUNTIME_STORAGE_KEY)).toBe(
      '{"rpcUrl":"ws://127.0.0.1:4567/rpc","bearerToken":"fresh-token"}',
    )
  })

  it("ignore un bootstrap desktop illisible", () => {
    const storage = memoryStorage({
      [DESKTOP_RUNTIME_STORAGE_KEY]: "{not-json",
    })

    expect(resolveDesktopRuntimeEnvironment("", storage)).toEqual({})
    expect(
      resolveDesktopRuntimeEnvironment(
        "?rpc=ws%3A%2F%2F127.0.0.1%3A4567%2Frpc&token=launch-token",
        storage,
      ),
    ).toEqual({
      VITE_NOYAU_RPC_URL: "ws://127.0.0.1:4567/rpc",
      VITE_NOYAU_BEARER_TOKEN: "launch-token",
    })
  })
})
