import {
  NOYAU_AGENT_SKILL_NAME,
  NOYAU_AGENT_SKILL_VERSION,
} from "@noyau/contracts/agent-integration"

import { NOYAU_AGENT_SKILL_FILES } from "./generated.ts"

export interface AgentSkillFile {
  readonly path: string
  readonly content: string
}

export const NOYAU_AGENT_SKILL = {
  name: NOYAU_AGENT_SKILL_NAME,
  version: NOYAU_AGENT_SKILL_VERSION,
  files: NOYAU_AGENT_SKILL_FILES satisfies ReadonlyArray<AgentSkillFile>,
} as const
