import { useAtomValue } from "@effect/atom-react"
import type { ThreadEnvMode } from "@noyau/protocol/entities/checkout"

import { threadEnvModePreferenceAtom } from "@/state/preferences"

export const useThreadEnvModePreference = (): ThreadEnvMode =>
  useAtomValue(threadEnvModePreferenceAtom)
