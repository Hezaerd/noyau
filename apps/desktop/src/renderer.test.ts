import { describe, expect, it } from "@effect/vitest"
import { Cause, Effect, FileSystem, Option, Path, PlatformError } from "effect"

import {
  DESKTOP_URL,
  DEFAULT_DEVELOPMENT_RENDERER_URL,
  DEVELOPMENT_RENDERER_URL,
  LOCAL_CONTROL_PLANE_RPC_URL,
  desktopUrlForServer,
  developmentRendererUrlFromEnv,
  resolvePackagedRendererAssetPath,
  resolveRendererAssetPath,
} from "./renderer"

const fileInfo = (type: FileSystem.File.Type): FileSystem.File.Info => ({
  type,
  mtime: Option.none(),
  atime: Option.none(),
  birthtime: Option.none(),
  dev: 0,
  ino: Option.none(),
  mode: 0,
  nlink: Option.none(),
  uid: Option.none(),
  gid: Option.none(),
  rdev: Option.none(),
  size: FileSystem.Size(0),
  blksize: Option.none(),
  blocks: Option.none(),
})

const trackedFileSystem = (
  files: Readonly<Record<string, FileSystem.File.Type>>,
  statError?: PlatformError.PlatformError,
) => {
  const existsCalls: Array<string> = []
  const statCalls: Array<string> = []
  const fileSystem = FileSystem.makeNoop({
    exists: (filePath) => {
      existsCalls.push(filePath)
      return Effect.succeed(filePath in files)
    },
    stat: (filePath) => {
      statCalls.push(filePath)
      if (statError !== undefined) {
        return Effect.fail(statError)
      }
      return Effect.succeed(fileInfo(files[filePath] ?? "Unknown"))
    },
  })
  return { existsCalls, fileSystem, statCalls }
}

describe("desktop renderer", () => {
  it("uses stable loopback and application URLs", () => {
    expect(DESKTOP_URL).toBe("noyau://app/")
    expect(DEFAULT_DEVELOPMENT_RENDERER_URL).toBe("http://127.0.0.1:5173/")
    expect(DEVELOPMENT_RENDERER_URL).toBe("http://127.0.0.1:5173/")
    expect(LOCAL_CONTROL_PLANE_RPC_URL).toBe("ws://127.0.0.1:3001/rpc")
  })

  it("reads the runner's Vite URL without baking it at pack time", () => {
    expect(developmentRendererUrlFromEnv({ NOYAU_DEV_RENDERER_URL: "http://127.0.0.1:5183" })).toBe(
      "http://127.0.0.1:5183/",
    )
    expect(developmentRendererUrlFromEnv({ VITE_DEV_SERVER_URL: "http://127.0.0.1:5200/" })).toBe(
      "http://127.0.0.1:5200/",
    )
  })

  it("passes the supervisor-owned loopback connection to the renderer without IPC", () => {
    expect(desktopUrlForServer("127.0.0.1", 4567, "launch-token")).toBe(
      "noyau://app/?rpc=ws%3A%2F%2F127.0.0.1%3A4567%2Frpc&token=launch-token&channel=latest",
    )
    expect(desktopUrlForServer("127.0.0.1", 4567, "launch-token", "nightly")).toBe(
      "noyau://app/?rpc=ws%3A%2F%2F127.0.0.1%3A4567%2Frpc&token=launch-token&channel=nightly",
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

  spec.effect("checks an existing asset once", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const rendererRoot = path.join("/tmp", "noyau-renderer")
      const requestedAssetPath = path.join(rendererRoot, "assets", "app.js")
      const tracked = trackedFileSystem({ [requestedAssetPath]: "File" })

      const assetPath = yield* resolvePackagedRendererAssetPath(
        rendererRoot,
        "/assets/app.js",
        requestedAssetPath,
      ).pipe(Effect.provideService(FileSystem.FileSystem, tracked.fileSystem))

      expect(assetPath).toBe(requestedAssetPath)
      expect(tracked.existsCalls).toEqual([requestedAssetPath])
      expect(tracked.statCalls).toEqual([requestedAssetPath])
    }),
  )

  spec.effect("does not duplicate a missing extension asset check", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const rendererRoot = path.join("/tmp", "noyau-renderer")
      const requestedAssetPath = path.join(rendererRoot, "assets", "missing.js")
      const tracked = trackedFileSystem({})

      const assetPath = yield* resolvePackagedRendererAssetPath(
        rendererRoot,
        "/assets/missing.js",
        requestedAssetPath,
      ).pipe(Effect.provideService(FileSystem.FileSystem, tracked.fileSystem))

      expect(assetPath).toBeUndefined()
      expect(tracked.existsCalls).toEqual([requestedAssetPath])
      expect(tracked.statCalls).toEqual([])
    }),
  )

  spec.effect("checks the SPA fallback once for an extensionless route", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const rendererRoot = path.join("/tmp", "noyau-renderer")
      const requestedAssetPath = path.join(rendererRoot, "projects", "missing")
      const fallbackPath = path.join(rendererRoot, "index.html")
      const tracked = trackedFileSystem({ [fallbackPath]: "File" })

      const assetPath = yield* resolvePackagedRendererAssetPath(
        rendererRoot,
        "/projects/missing",
        requestedAssetPath,
      ).pipe(Effect.provideService(FileSystem.FileSystem, tracked.fileSystem))

      expect(assetPath).toBe(fallbackPath)
      expect(tracked.existsCalls).toEqual([requestedAssetPath, fallbackPath])
      expect(tracked.statCalls).toEqual([fallbackPath])
    }),
  )

  spec.effect("does not check the root entry point twice when it is missing", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const rendererRoot = path.join("/tmp", "noyau-renderer")
      const requestedAssetPath = path.join(rendererRoot, "index.html")
      const tracked = trackedFileSystem({})

      const assetPath = yield* resolvePackagedRendererAssetPath(
        rendererRoot,
        "/",
        requestedAssetPath,
      ).pipe(Effect.provideService(FileSystem.FileSystem, tracked.fileSystem))

      expect(assetPath).toBeUndefined()
      expect(tracked.existsCalls).toEqual([requestedAssetPath])
      expect(tracked.statCalls).toEqual([])
    }),
  )

  spec.effect("does not serve directories as extensioned assets", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const rendererRoot = path.join("/tmp", "noyau-renderer")
      const requestedAssetPath = path.join(rendererRoot, "assets", "bundle.js")
      const tracked = trackedFileSystem({ [requestedAssetPath]: "Directory" })

      const assetPath = yield* resolvePackagedRendererAssetPath(
        rendererRoot,
        "/assets/bundle.js",
        requestedAssetPath,
      ).pipe(Effect.provideService(FileSystem.FileSystem, tracked.fileSystem))

      expect(assetPath).toBeUndefined()
      expect(tracked.existsCalls).toEqual([requestedAssetPath])
      expect(tracked.statCalls).toEqual([requestedAssetPath])
    }),
  )

  spec.effect("preserves filesystem errors from the requested asset check", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const rendererRoot = path.join("/tmp", "noyau-renderer")
      const requestedAssetPath = path.join(rendererRoot, "assets", "app.js")
      const statError = PlatformError.systemError({
        _tag: "PermissionDenied",
        module: "FileSystem",
        method: "stat",
        pathOrDescriptor: requestedAssetPath,
      })
      const tracked = trackedFileSystem({ [requestedAssetPath]: "File" }, statError)
      const result = yield* Effect.exit(
        resolvePackagedRendererAssetPath(rendererRoot, "/assets/app.js", requestedAssetPath).pipe(
          Effect.provideService(FileSystem.FileSystem, tracked.fileSystem),
        ),
      )

      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") {
        expect(Option.getOrUndefined(Cause.findErrorOption(result.cause))).toBe(statError)
      }
    }),
  )
})
