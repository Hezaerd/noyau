import { Option, Schema } from "effect"

const DEFAULT_RPC_URL = "ws://127.0.0.1:3001/rpc"
const DEFAULT_BEARER_TOKEN = "noyau-development-token"

export const DESKTOP_RUNTIME_STORAGE_KEY = "noyau.desktop.control-plane"

const ControlPlaneEnvironment = Schema.Struct({
  VITE_NOYAU_RPC_URL: Schema.optionalKey(Schema.String),
  VITE_NOYAU_BEARER_TOKEN: Schema.optionalKey(Schema.String),
})
type ControlPlaneEnvironment = (typeof ControlPlaneEnvironment)["Type"]
type ControlPlaneEnvironmentInput = Readonly<Record<string, string | boolean | undefined>>

const ControlPlaneConfig = Schema.Struct({
  rpcUrl: Schema.NonEmptyString,
  bearerToken: Schema.NonEmptyString,
})

export type ControlPlaneConfig = (typeof ControlPlaneConfig)["Type"]

const StoredDesktopRuntime = Schema.Struct({
  rpcUrl: Schema.optionalKey(Schema.NonEmptyString),
  bearerToken: Schema.optionalKey(Schema.NonEmptyString),
})
type StoredDesktopRuntime = (typeof StoredDesktopRuntime)["Type"]

const decodeEnvironment = Schema.decodeUnknownSync(ControlPlaneEnvironment)
const decodeConfig = Schema.decodeUnknownSync(ControlPlaneConfig)
const decodeStoredDesktopRuntime = Schema.decodeUnknownOption(
  Schema.fromJsonString(StoredDesktopRuntime),
)
const encodeStoredDesktopRuntime = Schema.encodeSync(Schema.fromJsonString(StoredDesktopRuntime))

export type DesktopRuntimeStorage = Pick<Storage, "getItem" | "setItem">

export const decodeControlPlaneConfig = (
  input: ControlPlaneEnvironmentInput,
): ControlPlaneConfig => {
  const environment = decodeEnvironment(input)
  return decodeConfig({
    rpcUrl: environment.VITE_NOYAU_RPC_URL ?? DEFAULT_RPC_URL,
    bearerToken: environment.VITE_NOYAU_BEARER_TOKEN ?? DEFAULT_BEARER_TOKEN,
  })
}

const runtimeFromSearch = (search: string): StoredDesktopRuntime => {
  const query = new URLSearchParams(search)
  const rpcUrl = query.get("rpc")
  const bearerToken = query.get("token")
  const runtime: StoredDesktopRuntime = {}
  if (rpcUrl !== null && rpcUrl !== "") {
    Object.assign(runtime, { rpcUrl })
  }
  if (bearerToken !== null && bearerToken !== "") {
    Object.assign(runtime, { bearerToken })
  }
  return runtime
}

const readStoredDesktopRuntime = (storage: DesktopRuntimeStorage): StoredDesktopRuntime => {
  try {
    return Option.getOrElse(
      decodeStoredDesktopRuntime(storage.getItem(DESKTOP_RUNTIME_STORAGE_KEY)),
      () => ({}),
    )
  } catch {
    return {}
  }
}

const persistDesktopRuntime = (
  storage: DesktopRuntimeStorage,
  runtime: StoredDesktopRuntime,
): void => {
  if (runtime.rpcUrl === undefined && runtime.bearerToken === undefined) {
    return
  }
  try {
    storage.setItem(DESKTOP_RUNTIME_STORAGE_KEY, encodeStoredDesktopRuntime(runtime))
  } catch {
    // The launch bootstrap stays in memory for this renderer session.
  }
}

const toEnvironment = (runtime: StoredDesktopRuntime): ControlPlaneEnvironment => {
  const environment: ControlPlaneEnvironment = {}
  if (runtime.rpcUrl !== undefined) {
    Object.assign(environment, { VITE_NOYAU_RPC_URL: runtime.rpcUrl })
  }
  if (runtime.bearerToken !== undefined) {
    Object.assign(environment, { VITE_NOYAU_BEARER_TOKEN: runtime.bearerToken })
  }
  return environment
}

const mergeDesktopRuntime = (
  stored: StoredDesktopRuntime,
  fromSearch: StoredDesktopRuntime,
): StoredDesktopRuntime => {
  const rpcUrl = fromSearch.rpcUrl ?? stored.rpcUrl
  const bearerToken = fromSearch.bearerToken ?? stored.bearerToken
  const runtime: StoredDesktopRuntime = {}
  if (rpcUrl !== undefined) {
    Object.assign(runtime, { rpcUrl })
  }
  if (bearerToken !== undefined) {
    Object.assign(runtime, { bearerToken })
  }
  return runtime
}

const sessionStorageOrUndefined = (): DesktopRuntimeStorage | undefined => {
  try {
    return globalThis.sessionStorage
  } catch {
    return undefined
  }
}

// `validateSearch` du Tableau retire `rpc`/`token`. On persiste le bootstrap
// du lancement pour qu'un reload Vite/Electron rediale le bon loopback.
export const resolveDesktopRuntimeEnvironment = (
  search: string,
  storage?: DesktopRuntimeStorage,
): ControlPlaneEnvironment => {
  const resolved = mergeDesktopRuntime(
    storage === undefined ? {} : readStoredDesktopRuntime(storage),
    runtimeFromSearch(search),
  )
  if (storage !== undefined) {
    persistDesktopRuntime(storage, resolved)
  }
  return toEnvironment(resolved)
}

const desktopRuntimeConfig = (): ControlPlaneEnvironment => {
  if (!("window" in globalThis)) {
    return {}
  }
  return resolveDesktopRuntimeEnvironment(
    globalThis.window.location.search,
    sessionStorageOrUndefined(),
  )
}

export const controlPlaneConfig = decodeControlPlaneConfig({
  ...import.meta.env,
  ...desktopRuntimeConfig(),
})
