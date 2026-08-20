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

export const decodeControlPlaneConfig = (
  input: ControlPlaneEnvironmentInput,
): ControlPlaneConfig => {
  const environment = decodeEnvironment(input)
  return decodeConfig({
    rpcUrl: environment.VITE_NOYAU_RPC_URL ?? DEFAULT_RPC_URL,
    bearerToken: environment.VITE_NOYAU_BEARER_TOKEN ?? DEFAULT_BEARER_TOKEN,
  })
}

const desktopRuntimeConfig = (): ControlPlaneEnvironmentInput => {
  if (!("window" in globalThis)) {
    return {}
  }
  const query = new URLSearchParams(globalThis.window.location.search)
  const rpcUrl = query.get("rpc")
  const bearerToken = query.get("token")
  const config: Record<string, string> = {}
  if (rpcUrl !== null) {
    config.VITE_NOYAU_RPC_URL = rpcUrl
  }
  if (bearerToken !== null) {
    config.VITE_NOYAU_BEARER_TOKEN = bearerToken
  }
  return config
}

export const controlPlaneConfig = decodeControlPlaneConfig({
  ...import.meta.env,
  ...desktopRuntimeConfig(),
})
