import { ActorId, MissionId, ProjectId } from "@noyau/protocol/ids"
import { Schema } from "effect"

const DEFAULT_PROJECT_ID = "10000000-0000-4000-8000-000000000001"
const DEFAULT_MISSION_ID = "30000000-0000-4000-8000-000000000001"
const DEFAULT_ACTOR_ID = "human:sandbox"

const SandboxEnvironment = Schema.Struct({
  VITE_NOYAU_API_BASE_URL: Schema.optionalKey(Schema.String),
  VITE_NOYAU_PROJECT_ID: Schema.optionalKey(Schema.String),
  VITE_NOYAU_MISSION_ID: Schema.optionalKey(Schema.String),
  VITE_NOYAU_ACTOR_ID: Schema.optionalKey(Schema.String),
})

const SandboxConfig = Schema.Struct({
  apiBaseUrl: Schema.String,
  projectId: ProjectId,
  missionId: MissionId,
  actorId: ActorId,
})

export type SandboxConfig = (typeof SandboxConfig)["Type"]

const decodeEnvironment = Schema.decodeUnknownSync(SandboxEnvironment)
const decodeConfig = Schema.decodeUnknownSync(SandboxConfig)

export const decodeSandboxConfig = (input: unknown): SandboxConfig => {
  const environment = decodeEnvironment(input)

  return decodeConfig({
    apiBaseUrl: environment.VITE_NOYAU_API_BASE_URL ?? "",
    projectId: environment.VITE_NOYAU_PROJECT_ID ?? DEFAULT_PROJECT_ID,
    missionId: environment.VITE_NOYAU_MISSION_ID ?? DEFAULT_MISSION_ID,
    actorId: environment.VITE_NOYAU_ACTOR_ID ?? DEFAULT_ACTOR_ID,
  })
}

export const sandboxConfig = decodeSandboxConfig(import.meta.env)
