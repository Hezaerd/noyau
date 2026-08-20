import { describe, expect, it } from "@effect/vitest"
import { Effect, Path } from "effect"

import {
  DESKTOP_URL,
  DEVELOPMENT_RENDERER_URL,
  LOCAL_CONTROL_PLANE_RPC_URL,
  desktopUrlForServer,
  resolveRendererAssetPath,
} from "./renderer"

describe("desktop renderer", () => {
  it("uses stable loopback and application URLs", () => {
    expect(DESKTOP_URL).toBe("noyau://app/")
    expect(DEVELOPMENT_RENDERER_URL).toBe("http://127.0.0.1:5173/")
    expect(LOCAL_CONTROL_PLANE_RPC_URL).toBe("ws://127.0.0.1:3001/rpc")
  })

  it("passes the supervisor-owned loopback connection to the renderer without IPC", () => {
    expect(desktopUrlForServer("127.0.0.1", 4567, "launch-token")).toBe(
      "noyau://app/?rpc=ws%3A%2F%2F127.0.0.1%3A4567%2Frpc&token=launch-token",
    )
  })
})

it.layer(Path.layer)("desktop renderer paths", (spec) => {
  spec.effect("resolves renderer assets inside the packaged root", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const rendererRoot = path.join("/tmp", "noyau-renderer")

      expect(yield* resolveRendererAssetPath(rendererRoot, "/")).toBe(
        path.join(rendererRoot, "index.html"),
      )
      expect(yield* resolveRendererAssetPath(rendererRoot, "/assets/app.js")).toBe(
        path.join(rendererRoot, "assets", "app.js"),
      )
    }),
  )

  spec.effect("rejects paths escaping the packaged renderer", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const rendererRoot = path.join("/tmp", "noyau-renderer")

      expect(yield* resolveRendererAssetPath(rendererRoot, "/../secrets.txt")).toBeUndefined()
      expect(yield* resolveRendererAssetPath(rendererRoot, "/%E0%A4%A")).toBeUndefined()
    }),
  )
})
