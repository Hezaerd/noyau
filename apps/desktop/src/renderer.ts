import { Effect, FileSystem, Option, Path } from "effect"

import { DEFAULT_RELEASE_CHANNEL, type DesktopReleaseChannel } from "./release-channel"

export const DESKTOP_SCHEME = "noyau"
export const DESKTOP_HOST = "app"
export const DESKTOP_URL = `${DESKTOP_SCHEME}://${DESKTOP_HOST}/`
export const DEFAULT_DEVELOPMENT_RENDERER_URL = "http://127.0.0.1:5173/"
export const LOCAL_CONTROL_PLANE_RPC_URL = "ws://127.0.0.1:3001/rpc"

export const developmentRendererUrlFromEnv = (
  env: { readonly NOYAU_DEV_RENDERER_URL?: string; readonly VITE_DEV_SERVER_URL?: string } = {},
): string => {
  const raw = env.NOYAU_DEV_RENDERER_URL?.trim() || env.VITE_DEV_SERVER_URL?.trim()
  if (raw === undefined || raw === "") {
    return DEFAULT_DEVELOPMENT_RENDERER_URL
  }
  return raw.endsWith("/") ? raw : `${raw}/`
}

export const DEVELOPMENT_RENDERER_URL = DEFAULT_DEVELOPMENT_RENDERER_URL

export const desktopUrlForServer = (
  host: string,
  port: number,
  bearerToken: string,
  releaseChannel: DesktopReleaseChannel = DEFAULT_RELEASE_CHANNEL,
): string => {
  const query = new URLSearchParams({
    rpc: `ws://${host}:${port}/rpc`,
    token: bearerToken,
    channel: releaseChannel,
  })
  return `${DESKTOP_URL}?${query.toString()}`
}

export const resolveRendererAssetPath = Effect.fn("resolveRendererAssetPath")(function* (
  rendererRoot: string,
  requestPathname: string,
) {
  const path = yield* Path.Path
  const decodedPathname = yield* Effect.try(() => decodeURIComponent(requestPathname)).pipe(
    Effect.option,
  )
  if (Option.isNone(decodedPathname)) {
    return undefined
  }

  const relativePath = decodedPathname.value.replace(/^\/+/u, "")
  const candidate = path.resolve(rendererRoot, relativePath === "" ? "index.html" : relativePath)
  const candidateRelativePath = path.relative(rendererRoot, candidate)

  if (candidateRelativePath.startsWith("..") || path.isAbsolute(candidateRelativePath)) {
    return undefined
  }

  return candidate
})

const isExistingFile = Effect.fn("isExistingFile")(function* (filePath: string) {
  const fs = yield* FileSystem.FileSystem
  const exists = yield* fs.exists(filePath)
  if (!exists) {
    return false
  }
  const info = yield* fs.stat(filePath)
  return info.type === "File"
})

/** Selects a packaged asset, falling back to the SPA entry point for routes. */
export const resolvePackagedRendererAssetPath = Effect.fn("resolvePackagedRendererAssetPath")(
  function* (rendererRoot: string, requestPathname: string, requestedAssetPath: string) {
    const path = yield* Path.Path
    const servesExistingFile = yield* isExistingFile(requestedAssetPath)
    if (servesExistingFile) {
      return requestedAssetPath
    }

    if (path.extname(requestPathname) !== "") {
      return undefined
    }

    const fallbackPath = path.join(rendererRoot, "index.html")
    if (fallbackPath === requestedAssetPath) {
      return undefined
    }
    return (yield* isExistingFile(fallbackPath)) ? fallbackPath : undefined
  },
)
