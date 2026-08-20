import { Schema } from "effect"

const DEFAULT_RPC_URL = "ws://127.0.0.1:3001/rpc"
const DEFAULT_BEARER_TOKEN = "noyau-development-token"

const ControlPlaneEnvironment = Schema.Struct({
  VITE_NOYAU_RPC_URL: Schema.optionalKey(Schema.String),
  VITE_NOYAU_BEARER_TOKEN: Schema.optionalKey(Schema.String),
})
type ControlPlaneEnvironmentInput = Readonly<Record<string, string | boolean | undefined>>

const ControlPlaneConfig = Schema.Struct({
  rpcUrl: Schema.NonEmptyString,
  bearerToken: Schema.NonEmptyString,
})

export type ControlPlaneConfig = (typeof ControlPlaneConfig)["Type"]

const decodeEnvironment = Schema.decodeUnknownSync(ControlPlaneEnvironment)
const decodeConfig = Schema.decodeUnknownSync(ControlPlaneConfig)

const readDesktopBootstrap = (): { readonly rpcUrl?: string; readonly bearerToken?: string } => {
  if (typeof window === "undefined") {
    return {}
  }
  const query = new URLSearchParams(window.location.search)
  const rpcUrl = query.get("rpc")
  const bearerToken = query.get("token")
  return {
    ...(rpcUrl === null ? {} : { rpcUrl }),
    ...(bearerToken === null ? {} : { bearerToken }),
  }
}

export const decodeControlPlaneConfig = (
  input: ControlPlaneEnvironmentInput,
): ControlPlaneConfig => {
  const environment = decodeEnvironment(input)
  const desktopBootstrap = readDesktopBootstrap()
  return decodeConfig({
    rpcUrl: desktopBootstrap.rpcUrl ?? environment.VITE_NOYAU_RPC_URL ?? DEFAULT_RPC_URL,
    bearerToken:
      desktopBootstrap.bearerToken ??
      environment.VITE_NOYAU_BEARER_TOKEN ??
      DEFAULT_BEARER_TOKEN,
  })
}

const desktopRuntimeConfig = (): ControlPlaneEnvironmentInput => {
  if (typeof window === "undefined") {
    return {}
  }
  const query = new URLSearchParams(window.location.search)
  const rpcUrl = query.get("rpc")
  const bearerToken = query.get("token")
  return {
    ...(rpcUrl === null ? {} : { VITE_NOYAU_RPC_URL: rpcUrl }),
    ...(bearerToken === null ? {} : { VITE_NOYAU_BEARER_TOKEN: bearerToken }),
  }
}

export const controlPlaneConfig = decodeControlPlaneConfig({
  ...import.meta.env,
  ...desktopRuntimeConfig(),
})
