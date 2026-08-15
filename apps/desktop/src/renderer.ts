import { isAbsolute, relative, resolve } from "node:path"

export const DESKTOP_SCHEME = "noyau"
export const DESKTOP_HOST = "app"
export const DESKTOP_URL = `${DESKTOP_SCHEME}://${DESKTOP_HOST}/`
export const DEVELOPMENT_RENDERER_URL = "http://127.0.0.1:5173/"
export const LOCAL_CONTROL_PLANE_RPC_URL = "ws://127.0.0.1:3001/rpc"

export const resolveRendererAssetPath = (
  rendererRoot: string,
  requestPathname: string,
): string | undefined => {
  let decodedPathname: string
  try {
    decodedPathname = decodeURIComponent(requestPathname)
  } catch {
    return undefined
  }

  const relativePath = decodedPathname.replace(/^\/+/u, "")
  const candidate = resolve(rendererRoot, relativePath === "" ? "index.html" : relativePath)
  const candidateRelativePath = relative(rendererRoot, candidate)

  if (candidateRelativePath.startsWith("..") || isAbsolute(candidateRelativePath)) {
    return undefined
  }

  return candidate
}
