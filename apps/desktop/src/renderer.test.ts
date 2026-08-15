import { join } from "node:path"

import { describe, expect, it } from "vite-plus/test"

import {
  DESKTOP_URL,
  DEVELOPMENT_RENDERER_URL,
  LOCAL_CONTROL_PLANE_RPC_URL,
  resolveRendererAssetPath,
} from "./renderer"

describe("desktop renderer", () => {
  it("uses stable loopback and application URLs", () => {
    expect(DESKTOP_URL).toBe("noyau://app/")
    expect(DEVELOPMENT_RENDERER_URL).toBe("http://127.0.0.1:5173/")
    expect(LOCAL_CONTROL_PLANE_RPC_URL).toBe("ws://127.0.0.1:3001/rpc")
  })

  it("resolves renderer assets inside the packaged root", () => {
    const rendererRoot = join("/tmp", "noyau-renderer")

    expect(resolveRendererAssetPath(rendererRoot, "/")).toBe(join(rendererRoot, "index.html"))
    expect(resolveRendererAssetPath(rendererRoot, "/assets/app.js")).toBe(
      join(rendererRoot, "assets", "app.js"),
    )
  })

  it("rejects paths escaping the packaged renderer", () => {
    const rendererRoot = join("/tmp", "noyau-renderer")

    expect(resolveRendererAssetPath(rendererRoot, "/../secrets.txt")).toBeUndefined()
    expect(resolveRendererAssetPath(rendererRoot, "/%E0%A4%A")).toBeUndefined()
  })
})
