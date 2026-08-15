import { ProjectId } from "@noyau/protocol/ids"
import { Schema } from "effect"

const DEFAULT_PROJECT_ID = "10000000-0000-4000-8000-000000000001"
const DEFAULT_RPC_URL = "ws://127.0.0.1:3001/rpc"

const ControlPlaneEnvironment = Schema.Struct({
  VITE_NOYAU_RPC_URL: Schema.optionalKey(Schema.String),
  VITE_NOYAU_PROJECT_ID: Schema.optionalKey(Schema.String),
})
type ControlPlaneEnvironmentInput = Readonly<Record<string, string | boolean | undefined>>

const ControlPlaneConfig = Schema.Struct({
  rpcUrl: Schema.NonEmptyString,
  projectId: ProjectId,
})

export type ControlPlaneConfig = (typeof ControlPlaneConfig)["Type"]

const decodeEnvironment = Schema.decodeUnknownSync(ControlPlaneEnvironment)
const decodeConfig = Schema.decodeUnknownSync(ControlPlaneConfig)
const decodeProjectId = Schema.decodeUnknownSync(ProjectId)

export const decodeControlPlaneConfig = (
  input: ControlPlaneEnvironmentInput,
): ControlPlaneConfig => {
  const environment = decodeEnvironment(input)
  return decodeConfig({
    rpcUrl: environment.VITE_NOYAU_RPC_URL ?? DEFAULT_RPC_URL,
    projectId: environment.VITE_NOYAU_PROJECT_ID ?? DEFAULT_PROJECT_ID,
  })
}

export const controlPlaneConfig = decodeControlPlaneConfig(import.meta.env)

/**
 * La route garde un slug lisible tant que le registre des projets n'est pas
 * exposé. Un UUID explicite reste accepté pour les liens directs.
 */
export const resolveProjectId = (routeProjectId: string): ProjectId =>
  routeProjectId === "noyau" ? controlPlaneConfig.projectId : decodeProjectId(routeProjectId)
